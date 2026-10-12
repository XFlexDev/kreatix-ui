---
name: Kreatix UI
description: A free, open-source UI community with a component-led interface.
colors:
  background: "#000000"
  surface: "#101010"
  divider: "#282828"
  foreground: "#f2f2f0"
  secondary-text: "#a0a09d"
typography:
  body:
    fontFamily: "Bricolage, Arial, sans-serif"
    lineHeight: 1.5
  page-title:
    fontFamily: "Bricolage, Arial, sans-serif"
    fontSize: "34px"
  form-control:
    fontFamily: "Bricolage, Arial, sans-serif"
    fontSize: "16px"
rounded:
  control: "6px"
  preview: "12px"
components:
  primary-button:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    rounded: "{rounded.control}"
---

# Design System: Kreatix UI

## Overview

A component-led community workbench. OLED black platform chrome, monochrome controls, and unobscured maker credit. The work provides the expression; the platform stays restrained. These choices reflect the user's approved gallery direction and instructions to remove filler and make motion logical.

## Colors

Black is the page background. Near-white carries actions and readable text. Neutral tonal surfaces distinguish previews and inputs. Submitted work can use its own visual language inside the isolated preview; it does not recolor navigation.

## Typography

Self-hosted Bricolage Grotesque is the interface face. Use monospace only for actual code and commands. Keep headings compact and task-specific. All inputs, selects, and textareas are at least 16px, including code inputs, so iOS does not zoom on focus.

## Layout

Discovery starts with navigation, search/feed controls, filters, then previews. No hero copy or extra introduction. Gallery items use two columns on desktop and one on mobile, with metadata outside the preview. Publishing uses two columns and a sticky preview on desktop; on mobile the preview precedes the form. Avoid horizontal document overflow.

## Elevation & Depth

Flat tonal layering and thin neutral borders. No decorative shadows, glow, gradients, or blurred page transitions.

## Shapes

Restrained control and preview radii. Change geometry only when state or hierarchy changes, such as a gallery stage expanding into the same work's detail stage. Do not morph a button's shape merely because it is pressed.

## Components

- Navigation and tabs: shared active indicators follow related selections.
- Gallery: preserve item positions as filtering changes results; no repeated entrance choreography.
- Work navigation: stable preview identity provides card-to-detail geometry continuity. Unrelated route content changes without blanket blur, scale, or slide effects.
- Preview: explicit start/stop; one active gallery iframe. Maker attribution and source remain outside untrusted documents.
- Forms: native semantics, visible focus, validation, explicit save and submit. Retain the last successful preview on compilation errors.
- Touch: `touch-action: manipulation` prevents double-tap zoom; chrome is not selectable. Inputs, source, descriptions, and comments remain selectable. Preserve pinch zoom.
- Motion: spring stiffness 460, damping 42, mass 0.8. Native shared-stage transitions take 320ms with exponential ease-out. Respect reduced motion. No blanket blur or motion on unrelated content.

## Do's and Don'ts

- Show work, its original maker, source, and license.
- Use concise labels and progressive disclosure for optional publishing details.
- Retain necessary attribution and honest editorial-listing notices.
- Do not invent contributors, ratings, testimonials, or usage figures.
- No hero slogans, reassurance copy, decorative icons, paid rankings, or paid features.
- Never disable zoom across the viewport or block selection of useful text.
