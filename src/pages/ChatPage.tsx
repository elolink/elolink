import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/Avatar';
import { formatTime, cn } from '../lib/utils';
import type { DirectMessage, Profile } from '../lib/types';
import {
  Send,
  MessageSquare,
  Search,
  X,
} from 'lucide-react';

type ChatMode = { type: 'dm'; userId: string } | null;

export function ChatPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<ChatMode>(null);
  const [dmMessages, setDmMessages] = useState<DirectMessage[]>([]);
  const [dmProfiles, setDmProfiles] = useState<Map<string, Profile>>(new Map());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [conversations, setConversations] = useState<Profile[]>([]);
  const [lastMessageMap, setLastMessageMap] = useState<Map<string, string>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadDmMessages = useCallback(async (otherUserId: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${user.id})`)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) {
      console.error('Failed to load DMs:', error.message);
      return;
    }
    setDmMessages((data ?? []) as DirectMessage[]);
  }, [user]);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data: sentDms } = await supabase
      .from('direct_messages')
      .select('recipient_id, created_at')
      .eq('sender_id', user.id)
      .order('created_at', { ascending: false });
    const { data: receivedDms } = await supabase
      .from('direct_messages')
      .select('sender_id, created_at')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false });

    const userIds = new Set<string>();
    const lastMsgMap = new Map<string, string>();
    (sentDms ?? []).forEach((d) => {
      userIds.add(d.recipient_id);
      if (!lastMsgMap.has(d.recipient_id)) lastMsgMap.set(d.recipient_id, d.created_at);
    });
    (receivedDms ?? []).forEach((d) => {
      userIds.add(d.sender_id);
      if (!lastMsgMap.has(d.sender_id)) lastMsgMap.set(d.sender_id, d.created_at);
    });

    setLastMessageMap(lastMsgMap);

    if (userIds.size === 0) {
      setConversations([]);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .in('id', Array.from(userIds));
    const profileList = (profiles ?? []) as Profile[];
    setConversations(profileList);

    const profilesMap = new Map<string, Profile>();
    profileList.forEach((p) => profilesMap.set(p.id, p));
    setDmProfiles(profilesMap);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    if (mode) {
      loadDmMessages(mode.userId).finally(() => setLoading(false));
    } else {
      setDmMessages([]);
      setLoading(false);
    }
  }, [mode, loadDmMessages]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const timeout = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${searchQuery.trim().toLowerCase()}%`)
        .neq('id', user?.id ?? '')
        .limit(20);
      if (!error && data) {
        setSearchResults(data as Profile[]);
      }
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, user]);

  useEffect(() => {
    if (!mode || !user) return;
    const otherUserId = mode.userId;
    const channel = supabase
      .channel(`dm:${user.id}:${otherUserId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        (payload) => {
          const newMsg = payload.new as DirectMessage;
          const isRelevant =
            (newMsg.sender_id === user.id && newMsg.recipient_id === otherUserId) ||
            (newMsg.sender_id === otherUserId && newMsg.recipient_id === user.id);
          if (isRelevant) {
            setDmMessages((prev) => [...prev, newMsg]);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [mode, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dmMessages]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !user || !mode) return;
    const content = input.trim();
    setInput('');

    const { error } = await supabase.from('direct_messages').insert({
      sender_id: user.id,
      recipient_id: mode.userId,
      content,
    });
    if (error) {
      console.error('Failed to send DM:', error.message);
      setInput(content);
    }
    loadConversations();
  }

  function startDmWithUser(profile: Profile) {
    setMode({ type: 'dm', userId: profile.id });
    setShowSearch(false);
    setSearchQuery('');
    setDmProfiles((prev) => {
      const next = new Map(prev);
      next.set(profile.id, profile);
      return next;
    });
  }

  const activeDmProfile = mode ? dmProfiles.get(mode.userId) : null;

  const sortedConversations = [...conversations].sort((a, b) => {
    const aTime = lastMessageMap.get(a.id) ?? '';
    const bTime = lastMessageMap.get(b.id) ?? '';
    return bTime.localeCompare(aTime);
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* Chat sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Messages</h2>
          <button
            onClick={() => setShowSearch(true)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Search users"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {sortedConversations.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <MessageSquare className="mx-auto mb-2 h-8 w-8 text-slate-300" />
              <p className="text-xs text-slate-400">
                No conversations yet. Click the search icon to find and message any user by username.
              </p>
            </div>
          ) : (
            sortedConversations.map((p) => (
              <button
                key={p.id}
                onClick={() => setMode({ type: 'dm', userId: p.id })}
                className={cn(
                  'mb-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors',
                  mode?.userId === p.id ? 'bg-brand-blue-50 text-brand-blue-700' : 'text-slate-600 hover:bg-slate-50',
                )}
              >
                <Avatar profile={p} size="xs" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.display_name || 'Unknown'}</span>
                  {p.username && <span className="block truncate text-xs text-slate-400">@{p.username}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex flex-1 flex-col bg-slate-50">
        {mode ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3.5">
              <Avatar profile={activeDmProfile ?? null} size="md" />
              <div>
                <p className="font-semibold text-slate-900">{activeDmProfile?.display_name ?? 'Direct message'}</p>
                <p className="text-xs text-slate-500">{activeDmProfile?.username ? `@${activeDmProfile.username}` : ''}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-6">
              {loading ? (
                <div className="py-12 text-center text-sm text-slate-400">Loading messages...</div>
              ) : dmMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <MessageSquare className="mb-3 h-10 w-10 text-slate-300" />
                  <p className="text-sm text-slate-400">No messages yet. Say hello!</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {dmMessages.map((msg, idx) => {
                    const isOwn = msg.sender_id === user?.id;
                    const senderProfile = dmProfiles.get(msg.sender_id);
                    const prevMsg = idx > 0 ? dmMessages[idx - 1] : null;
                    const showHeader = !prevMsg || prevMsg.sender_id !== msg.sender_id;

                    return (
                      <div key={msg.id} className={cn('flex gap-3', showHeader ? 'mt-4' : 'mt-0.5')}>
                        {showHeader ? (
                          <Avatar profile={senderProfile ?? null} size="sm" className="mt-0.5" />
                        ) : (
                          <div className="w-8 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          {showHeader && (
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-semibold text-slate-900">
                                {isOwn ? 'You' : (senderProfile?.display_name ?? 'Unknown')}
                              </span>
                              <span className="text-xs text-slate-400">
                                {formatTime(msg.created_at)}
                              </span>
                            </div>
                          )}
                          <p className="text-sm text-slate-700 break-words">{msg.content}</p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-slate-200 bg-white p-4">
              <form onSubmit={sendMessage} className="flex gap-2">
                <input
                  className="input"
                  placeholder={`Message ${activeDmProfile?.display_name ?? 'user'}...`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <button type="submit" className="btn-primary" disabled={!input.trim()}>
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <MessageSquare className="mb-4 h-14 w-14 text-slate-300" />
            <h3 className="text-lg font-semibold text-slate-700">Start a conversation</h3>
            <p className="mt-1 text-sm text-slate-400">
              Search for any user by username to start chatting — no workspace required.
            </p>
            <button className="btn-primary mt-4" onClick={() => setShowSearch(true)}>
              <Search className="h-4 w-4" /> Search Users
            </button>
          </div>
        )}
      </div>

      {/* User search modal */}
      {showSearch && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-20" onClick={() => setShowSearch(false)}>
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-slate-900">Search Users</h2>
                <button onClick={() => setShowSearch(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  className="input pl-9"
                  placeholder="Search by username..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {searchLoading ? (
                <p className="p-4 text-center text-sm text-slate-400">Searching...</p>
              ) : searchResults.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-400">
                  {searchQuery.trim() ? 'No users found.' : 'Start typing a username to search.'}
                </p>
              ) : (
                searchResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => startDmWithUser(p)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
                  >
                    <Avatar profile={p} size="sm" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{p.display_name || 'Unknown'}</p>
                      {p.username && <p className="text-xs text-slate-400">@{p.username}</p>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
