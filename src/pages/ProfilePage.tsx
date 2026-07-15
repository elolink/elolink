import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { useWorkspace, useIsAdmin } from '../lib/workspace';
import { supabase } from '../lib/supabase';
import { Avatar } from '../components/Avatar';
import { eur, formatDate, hoursBetween, cn } from '../lib/utils';
import type { ShiftTask } from '../lib/types';
import { Loader2, Upload, Check, Mail, Calendar, Clock, TrendingUp, CreditCard, Shield, Globe } from 'lucide-react';

export function ProfilePage() {
  const { profile, user, refreshProfile } = useAuth();
  const { activeWorkspace, activeSubscription, activeRole } = useWorkspace();
  const isAdminUser = useIsAdmin();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [nationality, setNationality] = useState(profile?.nationality ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ tasks: 0, hours: 0, earnings: 0, completed: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  // Load user's task stats
  useEffect(() => {
    if (!user) return;
    supabase
      .from('shift_tasks')
      .select('total_eur, clock_in_at, clock_out_at, completed')
      .eq('assigned_user_id', user.id)
      .then(({ data }) => {
        if (!data) return;
        const tasks = data as Pick<ShiftTask, 'total_eur' | 'clock_in_at' | 'clock_out_at' | 'completed'>[];
        setStats({
          tasks: tasks.length,
          hours: tasks.reduce((s, t) => s + hoursBetween(t.clock_in_at, t.clock_out_at), 0),
          earnings: tasks.reduce((s, t) => s + (t.total_eur ?? 0), 0),
          completed: tasks.filter((t) => t.completed).length,
        });
      });
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        username: username.trim() || null,
        bio: bio.trim() || null,
        nationality: nationality.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user!.id);
    if (error) {
      setError(error.message);
    } else {
      setSaved(true);
      await refreshProfile();
      setTimeout(() => setSaved(false), 2500);
    }
    setSaving(false);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${user.id}/avatar.${ext}`;

      // Delete old avatar files
      const { data: oldFiles } = await supabase.storage.from('avatars').list(user.id);
      if (oldFiles && oldFiles.length > 0) {
        await supabase.storage.from('avatars').remove(oldFiles.map((f) => `${user.id}/${f.name}`));
      }

      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw updateError;

      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    }
    setUploading(false);
  }

  if (!profile || !user) return null;

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Profile Settings</h1>

      {/* Profile card */}
      <div className="card overflow-hidden">
        {/* Banner */}
        <div className="h-28 bg-gradient-to-r from-brand-blue-600 via-brand-green-600 to-brand-yellow-500" />

        <div className="px-6 pb-6">
          {/* Avatar + email */}
          <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="relative">
                <div className="rounded-full ring-4 ring-white">
                  <Avatar profile={profile} size="xl" />
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-slate-200 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin text-slate-600" /> : <Upload className="h-4 w-4 text-slate-600" />}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <div className="pb-1">
                <p className="text-xl font-bold text-slate-900">{profile.display_name || 'Your name'}</p>
                <p className="text-sm text-slate-500">{profile.username ? `@${profile.username}` : 'No username set'}</p>
              </div>
            </div>
          </div>

          {/* Account info */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3">
              <Mail className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-600">{user.email}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span className="text-sm text-slate-600">Joined {formatDate(profile.created_at)}</span>
            </div>
            {profile.nationality && (
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-3">
                <Globe className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-600">{profile.nationality}</span>
              </div>
            )}
          </div>

          {/* Bio */}
          {profile.bio && (
            <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-600">{profile.bio}</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total Tasks', value: stats.tasks.toString(), icon: Clock, color: 'text-brand-blue-600 bg-brand-blue-50' },
          { label: 'Completed', value: stats.completed.toString(), icon: Check, color: 'text-brand-green-600 bg-brand-green-50' },
          { label: 'Hours Logged', value: `${stats.hours.toFixed(1)}h`, icon: Clock, color: 'text-brand-yellow-600 bg-brand-yellow-50' },
          { label: 'Earnings', value: eur(stats.earnings), icon: TrendingUp, color: 'text-brand-green-600 bg-brand-green-50' },
        ].map((s) => (
          <div key={s.label} className="card p-5">
            <div className={cn('mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg', s.color)}>
              <s.icon className="h-5 w-5" />
            </div>
            <p className="text-xl font-bold text-slate-900">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Subscription section */}
      {activeWorkspace && activeRole === 'owner' && !isAdminUser && (
        <div className="mt-6 card p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Workspace Subscription</h2>
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-4 py-4">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              activeSubscription?.status === 'active' ? 'bg-brand-green-50 text-brand-green-600' : 'bg-brand-yellow-50 text-brand-yellow-600'
            )}>
              <CreditCard className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-900">
                {activeSubscription?.status === 'active' ? 'Active Subscription' : 'No Active Subscription'}
              </p>
              <p className="text-sm text-slate-500">
                {activeSubscription?.status === 'active'
                  ? `First month: $1.00, then $20.00/month`
                  : 'Subscribe to unlock workspace creation: $1 first month, then $20/month.'}
              </p>
            </div>
          </div>
          {activeSubscription?.status !== 'active' && (
            <div className="mt-4 rounded-lg border border-brand-yellow-200 bg-brand-yellow-50 p-4">
              <p className="text-sm text-brand-yellow-800">
                To activate this workspace, a Stripe payment integration is required. Once Stripe is configured,
                you'll be able to subscribe here with your first month at $1 and $20/month thereafter.
              </p>
              <a href="https://bolt.new/setup/stripe" className="mt-3 inline-block text-sm font-medium text-brand-green-600 hover:text-brand-green-700">
                Set up Stripe payments
              </a>
            </div>
          )}
        </div>
      )}

      {/* Admin badge */}
      {isAdminUser && (
        <div className="mt-6 card p-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Shield className="h-4 w-4 text-brand-green-600" />
            <span>Admin account - workspace creation and subscriptions are exempt.</span>
          </div>
        </div>
      )}

      {/* Edit form */}
      <div className="mt-6 card p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Edit Profile</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label" htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              required
              minLength={2}
            />
            <p className="mt-1.5 text-xs text-slate-400">This appears in chat, shift assignments, and report authorship.</p>
          </div>
          <div>
            <label className="label" htmlFor="username">Username</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">@</span>
              <input
                id="username"
                className="input pl-7"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="username"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">Letters, numbers, and underscores only. Other users can find you by this username.</p>
          </div>

          <div>
            <label className="label" htmlFor="bio">Bio</label>
            <textarea
              id="bio"
              className="input min-h-[80px]"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short description about yourself..."
              maxLength={200}
            />
            <p className="mt-1.5 text-xs text-slate-400">{bio.length}/200 characters</p>
          </div>

          <div>
            <label className="label" htmlFor="nationality">Nationality</label>
            <input
              id="nationality"
              className="input"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              placeholder="e.g. Portuguese, German, Brazilian..."
              maxLength={50}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save changes'}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-brand-green-600 animate-fade-in">
                <Check className="h-4 w-4" /> Saved
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
