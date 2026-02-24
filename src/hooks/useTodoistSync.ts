import { useState, useEffect, useCallback, useRef } from 'react';
import { TodoItem, TodoistConfig } from '@/types';

const TODOIST_BASE = 'https://api.todoist.com/api/v1';
const CACHE_KEY = 'tui-todoist-cache';
const TODOIST_ORIGINS = ['*://api.todoist.com/*'];

declare const chrome: any;

interface CachedData {
    tasks: TodoItem[];
    timestamp: number;
}

function loadCache(): CachedData | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function saveCache(tasks: TodoItem[]) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ tasks, timestamp: Date.now() }));
    } catch { /* quota exceeded — ignore */ }
}

// 获取 baseUrl（根据数据源类型）
function getBaseUrl(config: TodoistConfig): string {
    if (config.sourceType === 'custom' && config.customBaseUrl) {
        return config.customBaseUrl.replace(/\/$/, '');
    }
    return TODOIST_BASE;
}

async function checkHostPermission(config: TodoistConfig): Promise<boolean> {
    // 自定义接口不需要 Chrome 扩展权限
    if (config.sourceType === 'custom') return true;
    if (typeof chrome === 'undefined' || !chrome.permissions) return true;
    return chrome.permissions.contains({ origins: TODOIST_ORIGINS });
}

export async function requestTodoistPermission(): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome.permissions) return true;
    return chrome.permissions.request({ origins: TODOIST_ORIGINS });
}

async function todoistFetch(path: string, apiKey: string, options?: RequestInit, baseUrl?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    // 认证可选
    if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
    }
    // Only set Content-Type for requests with a body
    if (options?.body) {
        headers['Content-Type'] = 'application/json';
    }

    const url = `${baseUrl || TODOIST_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            ...headers,
            ...options?.headers,
        },
    });
    if (res.status === 401 || res.status === 403) {
        throw new Error('invalid api key');
    }
    if (!res.ok) {
        throw new Error(`api error (${res.status})`);
    }
    return res;
}

function mapTodoistTask(task: any): TodoItem {
    return {
        id: task.id,
        text: task.content,
        done: task.is_completed ?? false,
        due: task.due?.string || undefined,
    };
}

// v1 unified API returns paginated { results: [...] }, v2 returned a bare array
function extractTasks(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    if (Array.isArray(data?.items)) return data.items;
    return [];
}

export function useTodoistSync(config: TodoistConfig) {
    // 使用 sourceType 判断是否激活
    const isActive = config.sourceType !== 'local';

    const [tasks, setTasks] = useState<TodoItem[]>(() => {
        if (!isActive) return [];
        const cached = loadCache();
        return cached?.tasks ?? [];
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [needsPermission, setNeedsPermission] = useState(false);

    // Track latest config in refs to avoid stale closures
    const apiKeyRef = useRef(config.apiKey);
    apiKeyRef.current = config.apiKey;
    const configRef = useRef(config);
    configRef.current = config;

    const fetchTasks = useCallback(async () => {
        const baseUrl = getBaseUrl(config);

        const hasPermission = await checkHostPermission(config);
        if (!hasPermission) {
            setNeedsPermission(true);
            setLoading(false);
            return;
        }
        setNeedsPermission(false);

        setLoading(true);
        setError(null);
        try {
            const res = await todoistFetch('/tasks', config.apiKey, undefined, baseUrl);
            const data = await res.json();
            const mapped = extractTasks(data).map(mapTodoistTask);
            setTasks(mapped);
            saveCache(mapped);
        } catch (err: any) {
            setError(err.message || 'network error');
        } finally {
            setLoading(false);
        }
    }, [config]);

    // Fetch on mount / when config changes (only if active)
    useEffect(() => {
        if (!isActive) {
            setTasks([]);
            setError(null);
            setNeedsPermission(false);
            return;
        }
        // Load cache first for instant display
        const cached = loadCache();
        if (cached) setTasks(cached.tasks);
        fetchTasks();
    }, [isActive, fetchTasks]);

    const addTask = useCallback(async (text: string, due?: string) => {
        const apiKey = apiKeyRef.current;
        const baseUrl = getBaseUrl(configRef.current);

        // Optimistic: add a temporary task
        const tempId = `temp-${Date.now()}`;
        const tempTask: TodoItem = { id: tempId, text, done: false, due };
        setTasks(prev => [...prev, tempTask]);

        try {
            const body: any = { content: text };
            if (due) body.due_string = due;
            const res = await todoistFetch('/tasks', apiKey, {
                method: 'POST',
                body: JSON.stringify(body),
            }, baseUrl);
            const created = await res.json();
            // Replace temp task with real one
            setTasks(prev => prev.map(t => t.id === tempId ? mapTodoistTask(created) : t));
            saveCache(await fetchAndReturn(apiKey, baseUrl));
        } catch (err: any) {
            // Revert optimistic update
            setTasks(prev => prev.filter(t => t.id !== tempId));
            setError(err.message || 'failed to add task');
        }
    }, []);

    const toggleTask = useCallback(async (id: string, currentDone: boolean) => {
        const apiKey = apiKeyRef.current;
        const baseUrl = getBaseUrl(configRef.current);

        // Optimistic update
        setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !currentDone } : t));

        try {
            const endpoint = currentDone ? `/tasks/${id}/reopen` : `/tasks/${id}/close`;
            await todoistFetch(endpoint, apiKey, { method: 'POST' }, baseUrl);
            // Refetch to get accurate state (completed tasks disappear from GET /tasks)
            const fresh = await fetchAndReturn(apiKey, baseUrl);
            setTasks(fresh);
            saveCache(fresh);
        } catch (err: any) {
            // Revert
            setTasks(prev => prev.map(t => t.id === id ? { ...t, done: currentDone } : t));
            setError(err.message || 'failed to sync');
        }
    }, []);

    const removeTask = useCallback(async (id: string) => {
        const apiKey = apiKeyRef.current;
        const baseUrl = getBaseUrl(configRef.current);

        // Optimistic removal
        let removed: TodoItem | undefined;
        setTasks(prev => {
            removed = prev.find(t => t.id === id);
            return prev.filter(t => t.id !== id);
        });

        try {
            await todoistFetch(`/tasks/${id}`, apiKey, { method: 'DELETE' }, baseUrl);
            saveCache(await fetchAndReturn(apiKey, baseUrl));
        } catch (err: any) {
            // Revert
            if (removed) {
                setTasks(prev => [...prev, removed!]);
            }
            setError(err.message || 'failed to delete');
        }
    }, []);

    return { tasks, loading, error, needsPermission, addTask, toggleTask, removeTask, refetch: fetchTasks };
}

// Helper to fetch fresh task list
async function fetchAndReturn(apiKey: string, baseUrl: string): Promise<TodoItem[]> {
    try {
        const res = await todoistFetch('/tasks', apiKey, undefined, baseUrl);
        const data = await res.json();
        return extractTasks(data).map(mapTodoistTask);
    } catch {
        return [];
    }
}
