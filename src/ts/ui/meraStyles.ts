/**
 * @fileoverview Mera Unified Style System
 * @module ui/meraStyles
 * 
 * Centralized Tailwind class definitions for consistent styling across components.
 * 
 * Design Philosophy:
 * - Warm amber/brown palette ("alpine hike" aesthetic)
 * - Green for success/completion states
 * - Dark mode with amber tints (not pure white text)
 * - Accessible contrast ratios (WCAG AA minimum)
 * 
 * Usage:
 *   import { MeraStyles } from '../../ui/meraStyles';
 *   `<h1 class="${MeraStyles.typography.heading1}">Title</h1>`
 */

export const MeraStyles = {
  // ==========================================================================
  // TYPOGRAPHY
  // ==========================================================================
  
  typography: {
    /** Page title (e.g., "Mera") - 3xl, bold, centered */
    heading1: "text-3xl font-bold text-gray-900 dark:text-amber-50 mb-6 text-center",
    
    /** Section headers (e.g., "Learning Streak") - xl, semibold */
    heading2: "text-xl font-semibold text-gray-900 dark:text-amber-50 mb-3",
    
    /** Subsection headers (e.g., domain titles) - xl, bold */
    heading3: "text-xl font-bold",
    
    /** Item titles (e.g., lesson titles) - medium weight */
    heading4: "font-medium",
    
    /** Primary body text */
    body: "text-gray-800 dark:text-amber-100",
    
    /** Secondary/smaller body text */
    bodySmall: "text-sm text-gray-800 dark:text-amber-100",
    
    /** Emphasized text color only (no size) */
    textPrimary: "text-gray-900 dark:text-amber-50",
    
    /** Large display numbers (e.g., streak count) */
    displayLarge: "text-5xl font-bold text-green-600 dark:text-green-500",
    
    /** Medium display text (e.g., emojis, section icons) */
    displayMedium: "text-2xl",
    
    /** Icon/indicator size text */
    iconText: "text-lg",
  },

  // ==========================================================================
  // CONTAINERS & CARDS
  // ==========================================================================
  
  containers: {
    /** Full page wrapper */
    pageWrapper: "min-h-screen bg-mera-light dark:bg-mera-dark p-4",
    
    /** Main content container with responsive max-width */
    contentContainer: "max-w-4xl lg:max-w-6xl mx-auto space-y-6",
    
    /** Primary card (rounded corners, shadow, padding) */
    card: "bg-amber-100 dark:bg-amber-900/30 rounded-xl shadow-lg p-8",
    
    /** Secondary card (less padding, medium shadow) */
    cardMedium: "bg-amber-100 dark:bg-amber-900/30 rounded-lg shadow-md p-6",
    
    /** Compact card (for nested content) */
    cardCompact: "bg-amber-100 dark:bg-amber-900/30 rounded-lg shadow-md overflow-hidden",
    
    /** Message box (lighter, less prominent) */
    messageBox: "bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4",
  },

  // ==========================================================================
  // STATUS & FEEDBACK
  // ==========================================================================
  
  status: {
    /** Success message container */
    successBox: "bg-green-50 dark:bg-green-900/20 rounded-lg p-4",
    
    /** Success text (primary) - for headings */
    successText: "font-medium text-green-900 dark:text-green-200",
    
    /** Success text (secondary) - for body text */
    successTextSecondary: "text-sm text-green-700 dark:text-green-300",
    
    /** Success accent (checkmarks, highlights) */
    successAccent: "text-green-600 dark:text-green-500",
    
    /** Info/encouragement box (uses amber) */
    infoBox: "bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4",
  },

  // ==========================================================================
  // INTERACTIVE ELEMENTS
  // ==========================================================================
  
  interactive: {
    /** Primary action button (green, prominent) */
    buttonPrimary: "px-4 py-2 bg-green-600 dark:bg-green-500 text-white rounded hover:opacity-90 transition-opacity",
    
    /** Large clickable area (domain/section toggle) */
    buttonLarge: "w-full p-6 text-left hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors text-gray-900 dark:text-amber-50",
    
    /** Medium clickable area (lesson toggle) */
    buttonMedium: "flex-1 p-4 text-left flex items-center gap-3 text-gray-900 dark:text-amber-50",
    
    /** Standard hover state wrapper */
    hoverWrapper: "hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors",

    /** Submit button active */
    buttonSubmitActive: "px-4 py-2 rounded font-medium bg-amber-800 text-white opacity-100 cursor-pointer",
  
    /** Submit button dimmed */
    buttonSubmitDimmed: "px-4 py-2 rounded font-medium bg-amber-800 text-white opacity-50 cursor-not-allowed",
  },

  // ==========================================================================
  // PROGRESS & VISUAL ELEMENTS
  // ==========================================================================
  
  progress: {
    /** Progress bar container (background track) */
    barContainer: "w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3",
    
    /** Progress bar fill (animated green) */
    barFill: "bg-green-600 dark:bg-green-500 h-3 rounded-full transition-all duration-300",
  },

  // ==========================================================================
  // BORDERS & DIVIDERS
  // ==========================================================================
  
  borders: {
    /** Standard border color */
    default: "border-gray-200 dark:border-gray-700",
    
    /** Top border with padding */
    topSection: "border-t border-gray-200 dark:border-gray-700 pt-6",
    
    /** Bottom border on all children except last */
    bottomExceptLast: "border-b last:border-b-0 dark:border-gray-700",
  },

  // ==========================================================================
  // LAYOUT & SPACING
  // ==========================================================================
  
  layout: {
    /** Vertical spacing between major sections */
    spaceYLarge: "space-y-6",
    
    /** Vertical spacing between subsections */
    spaceYMedium: "space-y-4",
    
    /** Horizontal gap in flex/grid */
    gapSmall: "gap-3",
    
    /** Flex with items centered vertically */
    flexCenter: "flex items-center",
    
    /** Flex with space-between */
    flexBetween: "flex justify-between",
    
    /** Flex items centered, space between */
    flexCenterBetween: "flex items-center justify-between",
    
    /** Inline flex with baseline alignment */
    inlineFlexBaseline: "inline-flex items-baseline",
    
    /** Text alignment */
    textCenter: "text-center",
  },

  // ==========================================================================
  // SPECIFIC PATTERNS (commonly repeated combinations)
  // ==========================================================================
  
  patterns: {
    /** Icon + text message layout */
    messageLayout: "flex items-center",
    
    /** Accordion arrow (expands/collapses) */
    expandArrow: "text-2xl",
    
    /** Domain/section emoji */
    sectionEmoji: "text-2xl",
    
    /** Status icon (lesson completion) */
    statusIcon: "text-lg",
    
    /** Margin spacing after icons */
    iconMarginRight: "mr-3",
    
    /** Margin spacing on left side */
    marginLeftMedium: "ml-4",
    
    /** Bottom margin variations */
    marginBottom: {
      xlarge: "mb-6",
      large: "mb-4",
      medium: "mb-3",
      small: "mb-2",
      xsmall: "mb-1",
    },
    
    /** Top margin */
    marginTop: {
      small: "mt-1",
      medium: "mt-2",
    },
    
    /** Padding variations */
    padding: {
      medium: "px-4 pb-4",
      leftLarge: "pl-16",
    },
  },

} as const;

// Type helper for autocomplete
export type MeraStylesType = typeof MeraStyles;