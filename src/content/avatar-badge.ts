/**
 * Avatar Badge Component
 *
 * Creates visual badges showing team member profile pictures instead of just counts.
 * Features:
 * - Stacked circular avatars (like GitHub/Slack)
 * - Fallback to colored initials when no avatar
 * - Overflow badge (+N) for remaining team members
 * - Hover tooltip showing all names
 */

import { AssigneeInfo } from '../shared/types';

export interface AvatarBadgeOptions {
  maxVisible: number;      // Max avatars to show (default: 4)
  size: number;            // Circle diameter in px (default: 24)
  overlap: number;         // Overlap amount in px (default: 8)
  showTooltip: boolean;    // Show hover tooltip (default: true)
}

const DEFAULT_OPTIONS: AvatarBadgeOptions = {
  maxVisible: 4,
  size: 24,
  overlap: 8,
  showTooltip: true,
};

/**
 * Create avatar badge with stacked profile pictures
 */
export function createAvatarBadge(
  assignees: AssigneeInfo[],
  options: Partial<AvatarBadgeOptions> = {}
): HTMLElement {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const container = document.createElement('div');
  container.className = 'jira-plans-avatar-badge';
  container.style.cssText = `
    display: flex;
    align-items: center;
    height: ${opts.size}px;
  `;

  const visible = assignees.slice(0, opts.maxVisible);
  const overflow = assignees.length - opts.maxVisible;

  // Render visible avatars
  visible.forEach((assignee, index) => {
    const avatar = createAvatarCircle(assignee, {
      size: opts.size,
      zIndex: visible.length - index,  // Stack order (first on top)
    });
    avatar.style.marginLeft = index === 0 ? '0' : `-${opts.overlap}px`;
    container.appendChild(avatar);
  });

  // Render overflow badge
  if (overflow > 0) {
    const overflowBadge = createOverflowBadge(overflow, opts.size);
    container.appendChild(overflowBadge);
  }

  // Add tooltip
  if (opts.showTooltip) {
    const names = assignees.map(a => a.displayName).join('\n');
    container.title = names;
  }

  return container;
}

/**
 * Create single avatar circle
 */
function createAvatarCircle(
  assignee: AssigneeInfo,
  options: { size: number; zIndex: number }
): HTMLElement {
  const avatar = document.createElement('div');
  avatar.className = 'jira-plans-avatar';
  avatar.style.cssText = `
    width: ${options.size}px;
    height: ${options.size}px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    overflow: hidden;
    position: relative;
    z-index: ${options.zIndex};
    background: ${getColorForUser(assignee.accountId)};
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  `;

  // Try to load avatar image
  const avatarUrl = getOptimalAvatarUrl(assignee.avatarUrls, options.size);
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
    `;
    img.onerror = () => {
      // Fallback to initials on error
      avatar.innerHTML = '';
      avatar.appendChild(createInitialsBadge(assignee, options.size));
    };
    avatar.appendChild(img);
  } else {
    // No avatar URL, use initials
    avatar.appendChild(createInitialsBadge(assignee, options.size));
  }

  // Tooltip with name
  avatar.title = assignee.displayName;

  return avatar;
}

/**
 * Create initials badge (fallback when no avatar)
 */
function createInitialsBadge(
  assignee: AssigneeInfo,
  size: number
): HTMLElement {
  const initials = getInitials(assignee.displayName);
  const badge = document.createElement('div');
  badge.className = 'jira-plans-avatar-initials';
  badge.textContent = initials;
  badge.style.cssText = `
    font-size: ${Math.floor(size * 0.4)}px;
    font-weight: bold;
    color: white;
    user-select: none;
  `;
  return badge;
}

/**
 * Create overflow count badge (+5)
 */
function createOverflowBadge(count: number, size: number): HTMLElement {
  const badge = document.createElement('div');
  badge.className = 'jira-plans-avatar-overflow';
  badge.textContent = `+${count}`;
  badge.style.cssText = `
    font-size: ${Math.floor(size * 0.45)}px;
    font-weight: bold;
    color: white;
    background: rgba(0, 0, 0, 0.6);
    padding: 2px 6px;
    border-radius: ${size / 2}px;
    margin-left: 4px;
    white-space: nowrap;
    flex-shrink: 0;
  `;
  return badge;
}

/**
 * Get initials from display name
 */
function getInitials(displayName: string): string {
  return displayName
    .split(' ')
    .filter(part => part.length > 0)
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Get consistent color for user (based on account ID hash)
 */
function getColorForUser(accountId: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
    '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
    '#E74C3C', '#3498DB', '#9B59B6', '#2ECC71', '#F39C12',
    '#1ABC9C', '#E67E22', '#34495E', '#16A085', '#27AE60',
  ];

  // Simple hash function
  const hash = accountId
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);

  return colors[hash % colors.length];
}

/**
 * Select optimal avatar URL based on desired size
 */
function getOptimalAvatarUrl(
  avatarUrls: AssigneeInfo['avatarUrls'],
  desiredSize: number
): string | null {
  if (!avatarUrls) return null;

  // Pick closest size without upscaling
  if (desiredSize <= 16 && avatarUrls['16x16']) return avatarUrls['16x16'];
  if (desiredSize <= 24 && avatarUrls['24x24']) return avatarUrls['24x24'];
  if (desiredSize <= 32 && avatarUrls['32x32']) return avatarUrls['32x32'];
  if (avatarUrls['48x48']) return avatarUrls['48x48'];

  // Fallback to any available size
  return avatarUrls['24x24'] || avatarUrls['32x32'] || avatarUrls['16x16'] || avatarUrls['48x48'] || null;
}
