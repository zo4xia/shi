import React from 'react';

const IMAGE_AVATAR_RE = /^(https?:\/\/|data:image\/|app:\/\/|file:\/{2,}|[A-Za-z]:\\)/i;

export function isImageAvatarValue(value: string | null | undefined): boolean {
  return Boolean(value && IMAGE_AVATAR_RE.test(value.trim()));
}

export function renderAgentRoleAvatar(
  avatar: string | null | undefined,
  options?: {
    className?: string;
    alt?: string;
    fallback?: string;
  },
): React.ReactNode {
  const value = String(avatar || '').trim();
  const className = options?.className || 'h-8 w-8 rounded-full object-cover';

  if (isImageAvatarValue(value)) {
    return <img src={value} alt={options?.alt || 'avatar'} className={className} />;
  }

  return <span className={className}>{value || options?.fallback || '🙂'}</span>;
}
