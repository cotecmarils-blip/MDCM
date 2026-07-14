import React from 'react';
import { resolveMediaUrl } from '../utils/media';

export function getUserDisplayName(user) {
  if (!user) return '';
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return full || user.username || '';
}

export function getUserInitials(user) {
  if (!user) return '?';
  const first = (user.first_name || '').trim();
  const last = (user.last_name || '').trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  return (user.username || '?').slice(0, 2).toUpperCase();
}

function UserAvatar({ user, size = 'md', className = '' }) {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-24 h-24 text-2xl',
    xl: 'w-32 h-32 text-3xl',
  };
  const fotoUrl = user?.foto ? resolveMediaUrl(user.foto) : null;

  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt={getUserDisplayName(user)}
        className={`${sizes[size] || sizes.md} rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      className={`${sizes[size] || sizes.md} rounded-full shrink-0 inline-flex items-center justify-center font-semibold bg-navy-700 text-white ${className}`}
      aria-hidden="true"
    >
      {getUserInitials(user)}
    </span>
  );
}

export default UserAvatar;
