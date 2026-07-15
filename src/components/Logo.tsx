import { cn } from '../lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

const iconSize = { sm: 'h-7 w-7', md: 'h-9 w-9', lg: 'h-12 w-12' };
const textSize = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' };

export function Logo({ size = 'md', showText = true, className = '' }: LogoProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn(
          'relative flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-green-600 to-brand-green-700 shadow-md',
          iconSize[size],
        )}
      >
        <svg viewBox="0 0 32 32" className="h-2/3 w-2/3" fill="none">
          <path d="M9 22V10h3v9h6v3H9z" fill="white" />
          <circle cx="22" cy="11" r="3" fill="#fbbf24" />
        </svg>
      </div>
      {showText && (
        <span className={cn('font-extrabold tracking-tight text-slate-900', textSize[size])}>
          Elo<span className="text-brand-green-600">Link</span>
        </span>
      )}
    </div>
  );
}
