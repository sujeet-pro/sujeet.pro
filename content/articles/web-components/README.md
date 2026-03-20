---
title: Web Components Primer
description: >-
  Building framework-free reusable UI components with Custom Elements, Shadow DOM, and HTML templates — covering lifecycle callbacks, style encapsulation, slots for content projection, and naming conventions.
publishedDate: '2026-03-20'
lastUpdatedOn: '2026-03-20'
tags:
  - web-platform
draft: true
---

## What Are Web Components?

Web Components are a set of browser APIs that let you create reusable, encapsulated HTML elements. They work in any framework — or no framework at all — because they are built on web standards.

The three main APIs:

1. **Custom Elements** — define new HTML tags
2. **Shadow DOM** — encapsulate styles and markup
3. **Templates and Slots** — define reusable markup with content projection

## Custom Elements

Register a new tag by extending `HTMLElement`:

```js
class MyCard extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="card">
        <h2>${this.getAttribute('title') || ''}</h2>
        <slot></slot>
      </div>
    `
  }
}

customElements.define('my-card', MyCard)
```

Now `<my-card title="Hello">content</my-card>` works in any HTML document.

### Naming Rules

Custom element names must contain a hyphen (`-`). This prevents conflicts with current and future HTML elements:

- `my-card` — valid
- `app-header` — valid
- `card` — invalid (no hyphen)
- `my-Card` — invalid (uppercase)

## Shadow DOM

Shadow DOM creates an isolated DOM tree with its own scope for styles and markup. Styles inside the shadow root don't leak out; external styles don't leak in.

```js
class StyledCard extends HTMLElement {
  constructor() {
    super()
    const shadow = this.attachShadow({ mode: 'open' })
    shadow.innerHTML = `
      <style>
        :host {
          display: block;
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 1rem;
        }
        h2 {
          margin: 0 0 0.5rem;
          font-size: 1.25rem;
        }
      </style>
      <h2><slot name="title">Default Title</slot></h2>
      <slot></slot>
    `
  }
}
```

### Key Selectors

| Selector | Targets |
|----------|---------|
| `:host` | The custom element itself |
| `:host(.active)` | The element when it has class `active` |
| `::slotted(p)` | `<p>` elements projected into a slot |
| `:host-context(.dark)` | The element when an ancestor has `.dark` |

## Templates and Slots

`<template>` defines inert markup that isn't rendered until cloned. `<slot>` elements define insertion points for consumer content.

```html
<template id="card-template">
  <style>
    .card { padding: 1rem; border: 1px solid #e5e5e5; }
  </style>
  <div class="card">
    <h2><slot name="heading">Untitled</slot></h2>
    <div class="body">
      <slot></slot>
    </div>
  </div>
</template>
```

```js
class TemplateCard extends HTMLElement {
  constructor() {
    super()
    const template = document.getElementById('card-template')
    const shadow = this.attachShadow({ mode: 'open' })
    shadow.appendChild(template.content.cloneNode(true))
  }
}
```

Usage:

```html
<template-card>
  <span slot="heading">My Title</span>
  <p>Card content goes here.</p>
</template-card>
```

Named slots (`slot="heading"`) project content to specific locations. The default (unnamed) slot catches everything else.

## Lifecycle Callbacks

Custom elements have four lifecycle methods:

```js
class MyElement extends HTMLElement {
  connectedCallback() {
    // Element added to DOM — set up listeners, fetch data
  }

  disconnectedCallback() {
    // Element removed — clean up listeners, timers
  }

  attributeChangedCallback(name, oldValue, newValue) {
    // An observed attribute changed — update the component
  }

  static get observedAttributes() {
    // List of attributes to watch
    return ['title', 'variant']
  }
}
```

`attributeChangedCallback` only fires for attributes listed in `observedAttributes`. This is a performance optimization — the browser ignores changes to unlisted attributes.

## Practical Considerations

### Styling from Outside

Shadow DOM blocks external styles by default. If you want consumers to customize your component, expose custom properties:

```js
// Inside shadow DOM
shadow.innerHTML = `
  <style>
    :host {
      --card-bg: #fff;
      --card-radius: 8px;
    }
    .card {
      background: var(--card-bg);
      border-radius: var(--card-radius);
    }
  </style>
  <div class="card"><slot></slot></div>
`
```

Consumers override the properties without piercing the shadow boundary:

```css
my-card {
  --card-bg: #f0f0f0;
  --card-radius: 0;
}
```

### When to Use Web Components

Web Components are strongest when:

- You need truly reusable elements across different projects or frameworks
- You want style encapsulation without a build step
- You are building a design system consumed by teams with different tech stacks

They are less ideal for application-level UI where a framework's reactivity, routing, and state management provide more value.
