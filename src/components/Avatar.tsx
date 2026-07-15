import { initials } from '../lib/utils';
import type { Profile } from '../lib/types';

interface AvatarProps {
  profile?: Pick<Profile, 'display_name' | 'avatar_url' | 'username'> | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-20 w-20 text-2xl',
};

export function Avatar({ profile, size = 'md', className = '' }: AvatarProps) {
  const name = profile?.display_name || profile?.username || '?';
  const url = profile?.avatar_url;

  // Deterministic gradient based on name hash
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const gradients = [
    'from-brand-green-500 to-brand-blue-500',
    'from-brand-blue-500 to-brand-green-500',
    'from-brand-green-600 to-brand-yellow-500',
    'from-brand-blue-600 to-brand-green-400',
    'from-brand-yellow-500 to-brand-green-600',
    'from-brand-green-400 to-brand-blue-600',
  ];
  const gradient = gradients[hash % gradients.length];

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`rounded-full object-cover ring-2 ring-white shadow-sm ${sizeMap[size]} ${className}`}
      />
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${gradient} font-semibold text-white ring-2 ring-white shadow-sm ${sizeMap[size]} ${className}`}
    >
      {initials(name)}
    </div>
  );
}
