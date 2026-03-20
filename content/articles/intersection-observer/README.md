---
title: Intersection Observer API
description: >-
  Using the Intersection Observer API for efficient, off-main-thread visibility
  detection — replacing scroll event listeners with async callbacks for lazy
  loading, infinite scroll, fade-in animations, and sticky header effects.
publishedDate: '2026-03-20'
lastUpdatedOn: '2026-03-20'
tags:
  - web-platform
draft: true
---

## The Problem

Detecting when an element enters or leaves the viewport was historically done with scroll event listeners and `getBoundingClientRect()`. This approach is expensive — scroll events fire at high frequency, `getBoundingClientRect()` triggers layout recalculation, and the logic runs on the main thread.

The Intersection Observer API solves this by letting the browser handle visibility detection asynchronously, calling your code only when intersections actually change.

## Basic Usage

```js
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      console.log('Visible:', entry.target)
    }
  }
})

observer.observe(document.querySelector('.target'))
```

The callback receives an array of `IntersectionObserverEntry` objects, one per observed element that changed state.

### Entry Properties

Each entry provides:

```js
entry.isIntersecting     // boolean — is the element visible?
entry.intersectionRatio  // 0 to 1 — how much is visible
entry.boundingClientRect // element's position
entry.rootBounds         // viewport (or root element) bounds
entry.target             // the observed DOM element
```

## Configuration

The constructor accepts an options object:

```js
const observer = new IntersectionObserver(callback, {
  root: null,           // null = viewport, or a scrollable ancestor
  rootMargin: '0px',    // margin around root (CSS-like: "100px 0px")
  threshold: 0,         // ratio at which to trigger (0-1, or array)
})
```

### Thresholds

A single threshold fires the callback once when the element crosses that visibility ratio. An array fires at each threshold:

```js
// Fire at 0%, 25%, 50%, 75%, and 100% visibility
const observer = new IntersectionObserver(callback, {
  threshold: [0, 0.25, 0.5, 0.75, 1.0],
})
```

### Root Margin

`rootMargin` expands or contracts the detection zone. Positive values trigger the callback before the element is actually visible — useful for preloading:

```js
const observer = new IntersectionObserver(callback, {
  rootMargin: '200px 0px',  // trigger 200px before entering viewport
})
```

## Common Patterns

### Lazy Loading Images

```js
const imgObserver = new IntersectionObserver(
  (entries, observer) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue

      const img = entry.target
      img.src = img.dataset.src
      img.removeAttribute('data-src')
      observer.unobserve(img) // stop watching once loaded
    }
  },
  { rootMargin: '300px 0px' },
)

document.querySelectorAll('img[data-src]').forEach((img) => {
  imgObserver.observe(img)
})
```

Images start loading 300px before they scroll into view. Once loaded, they're unobserved to avoid unnecessary callbacks.

### Fade-In on Scroll

```js
const fadeObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      entry.target.classList.toggle('visible', entry.isIntersecting)
    }
  },
  { threshold: 0.15 },
)

document.querySelectorAll('.fade-in').forEach((el) => {
  fadeObserver.observe(el)
})
```

```css
.fade-in {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.4s, transform 0.4s;
}

.fade-in.visible {
  opacity: 1;
  transform: translateY(0);
}
```

### Sticky Header Shadow

```js
const sentinel = document.createElement('div')
document.body.prepend(sentinel)

new IntersectionObserver(([entry]) => {
  document.querySelector('header').classList.toggle(
    'scrolled',
    !entry.isIntersecting,
  )
}).observe(sentinel)
```

A zero-height sentinel element sits at the top of the page. When it scrolls out of view, the header gets a `scrolled` class — no scroll listener needed.

## Cleanup

Always disconnect observers when they're no longer needed:

```js
observer.unobserve(element) // stop watching one element
observer.disconnect()       // stop watching everything
```

In frameworks with lifecycle hooks, disconnect in the cleanup/unmount phase.

## Browser Support

Intersection Observer is supported in all modern browsers. For older browsers, the W3C provides a polyfill, but as of 2025 this is rarely needed.
