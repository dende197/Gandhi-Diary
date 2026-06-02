---
name: Liquid Glass Premium
colors:
  surface: '#fcf8fb'
  surface-dim: '#dcd9dc'
  surface-bright: '#fcf8fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7ea'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#414755'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#717786'
  outline-variant: '#c1c6d7'
  surface-tint: '#005bc1'
  primary: '#0058bc'
  on-primary: '#ffffff'
  primary-container: '#0070eb'
  on-primary-container: '#fefcff'
  inverse-primary: '#adc6ff'
  secondary: '#4c4aca'
  on-secondary: '#ffffff'
  secondary-container: '#6664e4'
  on-secondary-container: '#fffbff'
  tertiary: '#5a5c60'
  on-tertiary: '#ffffff'
  tertiary-container: '#737479'
  on-tertiary-container: '#fdfcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a41'
  on-primary-fixed-variant: '#004493'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c2c1ff'
  on-secondary-fixed: '#0c006a'
  on-secondary-fixed-variant: '#3631b4'
  tertiary-fixed: '#e2e2e7'
  tertiary-fixed-dim: '#c6c6cb'
  on-tertiary-fixed: '#1a1c1f'
  on-tertiary-fixed-variant: '#45474b'
  background: '#fcf8fb'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 56px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 34px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.2'
  title-md:
    fontFamily: Hanken Grotesk
    fontSize: 22px
    fontWeight: '500'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 17px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  margin-desktop: 64px
  margin-mobile: 20px
  gutter: 24px
  section-gap: 80px
  stack-sm: 8px
  stack-md: 16px
---

## Brand & Style

This design system embodies a "Liquid Glass" aesthetic—a hyper-premium evolution of glassmorphism tailored for high-end academic and professional environments. The brand personality is ethereal, precise, and intellectually sophisticated. It aims to evoke a sense of weightlessness and clarity, similar to looking through high-quality optical lenses.

The style is characterized by deep translucency, ultra-refined borders, and expansive whitespace. It leverages the depth of the "Z-axis" through layered glass panels rather than traditional drop shadows. The emotional response is one of calm, focused luxury, removing visual noise to highlight high-value academic content.

## Colors

The color palette is rooted in a pristine "Studio White" environment. Backgrounds are not flat; they use ethereal, layered mesh gradients with soft pulses of primary and secondary tints (e.g., #007AFF at 5% opacity) to create a sense of living light behind the glass surfaces.

- **Primary:** Apple-inspired Azure for active states and critical calls to action.
- **Secondary:** A soft violet for academic highlights and secondary focus areas.
- **Neutral:** A deep "Graphite" for text to ensure maximum legibility against translucent backgrounds.
- **Surface:** Highly translucent whites (rgba 255, 255, 255, 0.4 to 0.7) serve as the foundation for the glass panels.

## Typography

The typography system uses **Hanken Grotesk** to emulate the precision and neutrality of SF Pro. The system prioritizes "Optical Sizing" principles: display faces are tightly tracked and bold, while body text uses a generous 1.6x line height to ensure academic papers and long-form content remain legible and airy.

Labels and small metadata should be set in uppercase with slight letter-spacing to maintain a sophisticated, architectural feel. For large headers, use a semi-bold weight to anchor the page without overwhelming the delicate glass UI elements.

## Layout & Spacing

This design system utilizes a **fixed-center grid** for desktop (max-width 1280px) to maintain a cinematic, focused feel. Margins are intentionally wide to frame the "floating" glass modules.

- **Desktop:** 12-column grid, 64px outer margins, 24px gutters.
- **Tablet:** 8-column grid, 40px outer margins.
- **Mobile:** 4-column fluid grid, 20px outer margins.

The spacing rhythm follows a strict 8px base unit. Section gaps are generous (80px+) to allow the background gradients to breathe between the floating glass containers.

## Elevation & Depth

Depth is achieved through the "Liquid Glass" technique rather than traditional shadows.

1.  **Backdrop Blur:** All primary surfaces must have a `backdrop-filter: blur(40px)`.
2.  **Translucent Borders:** Panels are defined by a 1px "inner glow" border (rgba 255, 255, 255, 0.5) and a 0.5px external stroke (rgba 0, 0, 0, 0.05).
3.  **Layering:** Elements "higher" in the hierarchy should have a higher opacity background (e.g., 80%) compared to base layers (40%).
4.  **Shadows:** Use only one type of shadow—a very large, soft "Ambient Occlusion" shadow (60px blur, 4% opacity) to subtly lift the most important cards from the background.

## Shapes

The shape language is ultra-rounded, mimicking the soft industrial design of premium hardware.

- **Hero Elements:** 40px radius for top-level containers and primary feature cards.
- **Standard Cards:** 28px radius for secondary content and list items.
- **Navigation & Buttons:** Always pill-shaped (999px) to emphasize the "liquid" nature of the design.
- **Form Inputs:** 16px radius to balance the softness with functional structure.

## Components

### Navigation Bar
The navigation is a **Floating Pill Bar**. It should be horizontally centered, 24px from the bottom of the viewport. It features a 60px backdrop blur, a 1px white top-border, and icons that utilize a "glass-morphism" active state (a soft white circular glow behind the active icon).

### Buttons
- **Primary:** Solid blue with a subtle inner highlight. 16px vertical padding, 32px horizontal.
- **Glass Button:** Transparent background, 40px blur, 1px white border. Text in Primary color.

### Cards
Cards never have solid backgrounds. Use `rgba(255, 255, 255, 0.4)` as the base. Content inside cards should be padded by at least 32px. Use "Squircle" masking for any imagery inside cards to match the 28px/40px corner radius.

### Input Fields
Inputs are minimal: a subtle 1px border that becomes a 2px primary color border on focus. The background of the input should be slightly darker than the card it sits on to create an "inset" feel.

### Chips/Tags
Small, highly translucent pills with a 1px border. Use "Semi-bold" typography at 12px for the label inside.