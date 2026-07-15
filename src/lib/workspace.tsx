import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import type { Workspace, WorkspaceMember, WorkspaceRole, WorkspaceSubscription } from './types';

interface WorkspaceContextValue {
  workspaces: Workspace[];
  members: WorkspaceMember[];
  activeWorkspace: Workspace | null;
  activeRole: WorkspaceRole | null;
  activeSubscription: WorkspaceSubscription | null;
  loading: boolean;
  setActiveWorkspaceId: (id: string) => void;
  refreshWorkspaces: () => Promise<void>;
  refreshMembers: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<Workspace | null>;
  addMemberByEmail: (workspaceId: string, email: string, role?: WorkspaceRole) => Promise<{ error: string | null }>;
  updateMemberRole: (memberId: string, role: WorkspaceRole) => Promise<{ error: string | null }>;
  removeMember: (memberId: string) => Promise<{ error: string | null }>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const STORAGE_KEY = 'elolink_active_workspace';

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<WorkspaceSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;
  const activeRole = members.find((m) => m.workspace_id === activeWorkspaceId && m.user_id === user?.id)?.role ?? null;

  const refreshWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      return;
    }
    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('Failed to load workspaces:', error.message);
      return;
    }
    const wsList = (data ?? []) as Workspace[];
    setWorkspaces(wsList);
    if (wsList.length > 0) {
      const stored = localStorage.getItem(STORAGE_KEY);
      const exists = stored && wsList.some((w) => w.id === stored);
      if (!activeWorkspaceId || !exists) {
        const id = exists ? stored! : wsList[0].id;
        setActiveWorkspaceIdState(id);
        localStorage.setItem(STORAGE_KEY, id);
      }
    } else {
      setActiveWorkspaceIdState(null);
    }
  }, [user, activeWorkspaceId]);

  const refreshMembers = useCallback(async () => {
    if (!activeWorkspaceId) {
      setMembers([]);
      return;
    }
    const { data, error } = await supabase
      .from('workspace_members')
      .select('*, profile:profiles!workspace_members_user_id_fkey(*)')
      .eq('workspace_id', activeWorkspaceId)
      .order('joined_at', { ascending: true });
    if (error) {
      console.error('Failed to load members:', error.message);
      return;
    }
    setMembers((data ?? []) as WorkspaceMember[]);
  }, [activeWorkspaceId]);

  const refreshSubscription = useCallback(async () => {
    if (!activeWorkspaceId) {
      setSubscription(null);
      return;
    }
    const { data, error } = await supabase
      .from('workspace_subscriptions')
      .select('*')
      .eq('workspace_id', activeWorkspaceId)
      .maybeSingle();
    if (error) {
      console.error('Failed to load subscription:', error.message);
      return;
    }
    setSubscription(data as WorkspaceSubscription | null);
  }, [activeWorkspaceId]);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveWorkspaceIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const createWorkspace = useCallback(async (name: string, description?: string) => {
    if (!user) return null;
    const { data: ws, error } = await supabase
      .from('workspaces')
      .insert({ name, description: description ?? null, owner_id: user.id })
      .select('*')
      .maybeSingle();
    if (error || !ws) {
      console.error('Failed to create workspace:', error?.message);
      return null;
    }
    await refreshWorkspaces();
    setActiveWorkspaceId(ws.id);
    return ws as Workspace;
  }, [user, refreshWorkspaces, setActiveWorkspaceId]);

  const addMemberByEmail = useCallback(async (workspaceId: string, email: string, role: WorkspaceRole = 'member') => {
    if (!user) return { error: 'Not authenticated' };
    const { data: userId, error: rpcError } = await supabase.rpc('get_user_id_by_email', { p_email: email.trim().toLowerCase() });
    if (rpcError || !userId) {
      return { error: 'User not found. Ask them to sign up first, or check the email address.' };
    }
    const { error: insertError } = await supabase.from('workspace_members').insert({
      workspace_id: workspaceId,
      user_id: userId,
      role,
    });
    if (insertError) {
      if (insertError.code === '23505') return { error: 'User is already a member of this workspace.' };
      if (insertError.message.includes('maximum')) return { error: insertError.message };
      return { error: insertError.message };
    }
    await refreshMembers();
    return { error: null };
  }, [user, refreshMembers]);

  const updateMemberRole = useCallback(async (memberId: string, role: WorkspaceRole) => {
    const { error } = await supabase.from('workspace_members').update({ role }).eq('id', memberId);
    if (error) return { error: error.message };
    await refreshMembers();
    return { error: null };
  }, [refreshMembers]);

  const removeMember = useCallback(async (memberId: string) => {
    const { error } = await supabase.from('workspace_members').delete().eq('id', memberId);
    if (error) return { error: error.message };
    await refreshMembers();
    return { error: null };
  }, [refreshMembers]);

  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      setMembers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refreshWorkspaces().finally(() => setLoading(false));
  }, [user, refreshWorkspaces]);

  useEffect(() => {
    refreshMembers();
    refreshSubscription();
  }, [refreshMembers, refreshSubscription]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        members,
        activeWorkspace,
        activeRole,
        activeSubscription: subscription,
        loading,
        setActiveWorkspaceId,
        refreshWorkspaces,
        refreshMembers,
        refreshSubscription,
        createWorkspace,
        addMemberByEmail,
        updateMemberRole,
        removeMember,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}

export function useIsAdmin() {
  const { profile, user } = useAuth();
  if (profile?.username === 'lucas_tzanao') return true;
  if (user?.email === 'ltrindadezanao@gmail.com') return true;
  return false;
}
