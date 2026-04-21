---
title: "Web Components: Custom Elements, Shadow DOM, and practical boundaries"
linkTitle: 'Web Components'
description: >-
  A senior-level tour of Custom Elements, Shadow DOM, templates and slots, lifecycle semantics, styling and accessibility at the encapsulation boundary, form association, and framework interoperability — with clear criteria for when standards-native components earn their complexity.
publishedDate: 2026-03-20
lastUpdatedOn: 2026-04-14
tags:
  - web-platform
  - custom-elements
  - shadow-dom
  - accessibility
---

# Web Components: Custom Elements, Shadow DOM, and practical boundaries

Web Components are not a single API. They are a **composition of browser standards** — primarily [Custom Elements](https://html.spec.whatwg.org/multipage/custom-elements.html), [Shadow DOM](https://dom.spec.whatwg.org/#shadow-trees), and [HTML `<template>`](https://html.spec.whatwg.org/multipage/scripting.html#the-template-element) with [`<slot>`](https://html.spec.whatwg.org/multipage/scripting.html#the-slot-element) — that let you define reusable, encapsulated elements that work without a specific framework runtime. That portability is the headline benefit; the engineering cost is learning where the encapsulation boundary sits and how consumers (including frameworks) are supposed to cross it safely.

This article stays practical: mental model first, then lifecycle and styling APIs, then accessibility and forms, then interoperability and adoption heuristics. For a broader platform overview, the MDN guide [Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) remains the best consolidated entry point.

![Diagram: framework and page concerns connect to the custom element host; shadow tree and slots stay internal unless part APIs expose them.](./diagrams/wc-boundaries-and-interop-light.svg)
![Diagram: framework and page concerns connect to the custom element host; shadow tree and slots stay internal unless part APIs expose them.](./diagrams/wc-boundaries-and-interop-dark.svg)

## The three pillars (and the boundary they create)

1. **Custom Elements** — JavaScript classes registered with [`customElements.define()`](https://html.spec.whatwg.org/multipage/custom-elements.html#dom-customelementregistry-define), instantiated by the parser or `document.createElement()`.
2. **Shadow DOM** — an attached shadow tree with its own [style and DOM encapsulation](https://dom.spec.whatwg.org/#concept-shadow-tree) rules (with deliberate escape hatches).
3. **Templates and slots** — inert markup in [`<template>`](https://html.spec.whatwg.org/multipage/scripting.html#the-template-element) and [composed tree projection](https://dom.spec.whatwg.org/#concept-slot) via [`<slot>`](https://html.spec.whatwg.org/multipage/scripting.html#the-slot-element).

Together, they create a **hard boundary** between what you promise as a public surface (attributes, properties, events, CSS custom properties, and opt-in styling hooks) and what you treat as private implementation (nodes and selectors inside the shadow tree).

## Custom Elements: registration, attributes, and properties

You register a tag with a hyphen in the name (a requirement of the [valid custom element name](https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name) algorithm):

```js
class MyCard extends HTMLElement {
  connectedCallback() {
    this.textContent = this.getAttribute("title") ?? "";
  }
}

customElements.define("my-card", MyCard);
```

Two details trip up even experienced teams:

- **Attributes versus properties** — HTML attributes are strings; element state often is not. Frameworks and DOM APIs frequently set **properties**; your element should usually implement reflection patterns (or explicit setters) rather than assuming `attributeChangedCallback` alone will fire. The HTML spec’s notes on [reflecting IDL attributes](https://html.spec.whatwg.org/multipage/common-dom-interfaces.html#reflecting-content-attributes-in-idl-attributes) are the authoritative background.
- **`observedAttributes` is a filter** — [`attributeChangedCallback`](https://html.spec.whatwg.org/multipage/custom-elements.html#concept-custom-element-definition-attribute-changed-callback) only runs for attributes listed by [`static observedAttributes`](https://html.spec.whatwg.org/multipage/custom-elements.html#dom-element-observedattributes). Everything else is ignored for performance.

### Autonomous vs customized built-ins

Most examples use **autonomous** custom elements (`extends HTMLElement`). The platform also supports **customized built-ins** (`extends HTMLButtonElement`, etc.), which use `customElements.define(..., { extends: "button" })` and the `is=""` attribute — but [Safari has historically not shipped `is=""` for customized built-ins](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements#types_of_custom_element), so many design systems stick to autonomous elements for cross-browser predictability.

## Shadow DOM: open, closed, and what “encapsulation” means

`attachShadow({ mode: "open" | "closed" })` creates a shadow root. [`mode: "open"`](https://dom.spec.whatwg.org/#dom-element-attachshadow) allows `element.shadowRoot` for debugging, testing, and tooling; [`closed`](https://dom.spec.whatwg.org/#shadowrootmode-closed) hides that handle — which is **not a security boundary** (callers with script access can still wrap or proxy your element), but it does communicate “hands off” to well-behaved code.

![Diagram: host connects to shadow root; light DOM children project into slots; page CSS does not pierce the shadow boundary by default.](./diagrams/shadow-dom-encapsulation-light.svg)
![Diagram: host connects to shadow root; light DOM children project into slots; page CSS does not pierce the shadow boundary by default.](./diagrams/shadow-dom-encapsulation-dark.svg)

**Declarative Shadow DOM** ([HTML template element with `shadowrootmode`](https://html.spec.whatwg.org/multipage/scripting.html#attr-template-shadowrootmode)) matters for SSR and static HTML. Server-rendered shadow roots can improve first paint for component libraries, but you still need a coherent story for hydration and progressive enhancement — see [Declarative Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/template#declarative_shadow_dom) on MDN.

### Slots and composition

Named and default slots let consumers pass **light DOM** children that render **as if** they lived inside your component, while still participating in the [composed tree](https://dom.spec.whatwg.org/#composed-tree) for events and hit testing. Listen for [`slotchange`](https://html.spec.whatwg.org/multipage/scripting.html#event-slotchange) when you need to react to what actually got assigned (especially for lazy or conditional slotted content).

Imperative [slot assignment](https://dom.spec.whatwg.org/#slot-assignment) via [`HTMLSlotElement.assign()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLSlotElement/assign) exists for advanced cases; most libraries start with declarative `slot="name"` usage.

## Lifecycle: constructor discipline and document moves

![State diagram: constructed, connected, attribute changes, adopted across documents, disconnected, and garbage collection.](./diagrams/custom-element-lifecycle-light.svg)
![State diagram: constructed, connected, attribute changes, adopted across documents, disconnected, and garbage collection.](./diagrams/custom-element-lifecycle-dark.svg)

The [custom element reactions](https://html.spec.whatwg.org/multipage/custom-elements.html#custom-element-reactions) you reach for most often are:

| Callback | Spec hook | Typical use |
| --- | --- | --- |
| `constructor` | [create an element](https://html.spec.whatwg.org/multipage/custom-elements.html#concept-upgrade-an-element) | Call `super()`; **avoid** DOM reads/writes, attribute work, or child assumptions — the element may not be fully upgraded or connected. |
| `connectedCallback` | [inserted into a document](https://html.spec.whatwg.org/multipage/custom-elements.html#dom-lifecycle-callbacks-connected-callback) | Wire observers, start timers, render into shadow DOM. |
| `disconnectedCallback` | [removed from a document](https://html.spec.whatwg.org/multipage/custom-elements.html#dom-lifecycle-callbacks-disconnected-callback) | Tear down listeners and timers; undo side effects. |
| `attributeChangedCallback` | [attribute changed](https://html.spec.whatwg.org/multipage/custom-elements.html#dom-lifecycle-callbacks-attribute-changed-callback) | Sync observed attributes into shadow state. |
| `adoptedCallback` | [adopted into a new document](https://html.spec.whatwg.org/multipage/custom-elements.html#dom-lifecycle-callbacks-adopted-callback) | Reset document-scoped handles (`document` reference changes) when moving nodes across windows or templates. |

> [!TIP]
> If you need one-time setup that depends on layout, combine `connectedCallback` with `requestAnimationFrame` or [`ResizeObserver`](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver) rather than doing heavy measurement in the constructor.

There is **no built-in “render scheduling”** like a framework’s batching. If `attributeChangedCallback` can fire in bursts, debounce or microtask-coalesce updates to avoid redundant layout work.

## Styling across the boundary: shadow-safe defaults and opt-in escape hatches

Shadow DOM scopes selectors by default: **outside CSS does not match inside**, and **inside CSS does not leak out** ([shadow tree style scoping](https://dom.spec.whatwg.org/#shadow-tree-style-scoping)). Cross-boundary styling is intentional and versioned:

| Mechanism | Role | Notes |
| --- | --- | --- |
| [CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties) | Theming tokens | Inherit through the boundary; prefer this for colors, spacing, and typography contracts. |
| [`:host` / `:host(...)`](https://developer.mozilla.org/en-US/docs/Web/CSS/:host) | Style the custom element itself | Primary surface for layout (`display`, sizing) on the host. |
| [`::slotted(...)`](https://developer.mozilla.org/en-US/docs/Web/CSS/::slotted) | Style **light DOM** nodes assigned to slots | Limited selector syntax; you are still styling consumer-owned nodes — treat it as a compatibility surface, not a private implementation detail. |
| [`::part(...)`](https://developer.mozilla.org/en-US/docs/Web/CSS/::part) + [`part` / `exportparts`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/part) | Opt-in styling of **internal** shadow nodes | Stable only if you treat `part` names as semver API. |

> [!IMPORTANT]
> [`:host-context(...)`](https://developer.mozilla.org/en-US/docs/Web/CSS/:host-context) is **not reliably available** across engines (for example, Firefox does not implement it). Prefer theming via **custom properties** on ancestors or explicit host attributes instead of `host-context` for production systems.

## Accessibility: own the host contract

Assistive technologies generally interact with the **flattened tree** and focus navigation across shadow roots, but **ARIA semantics you care about usually need a clear owner**. Patterns that work well:

- Put **roles, names, and states** on the **host** when the host is the control (`button`-like widgets, switches, tabs) — see [Using ARIA: practical guide](https://www.w3.org/WAI/ARIA/apg/practices/) and [ARIA in HTML](https://w3c.github.io/html-aria/) for what is valid on which HTML elements.
- For rich content inside shadow DOM, ensure **focusable elements** have labels and that **keyboard order** matches visual order; `tabindex` gymnastics on slotted content are a smell that the component contract is unclear.
- Remember **`aria-*` reflects string semantics** — mirror boolean state to `aria-checked`, `aria-expanded`, etc., when you expose toggles or disclosure regions.

Web Components do not remove the need for accessibility testing; they move complexity to **your public API surface** (host attributes/properties/events) instead of framework component props.

## Form-associated custom elements

To participate in `<form>` submission, constraint validation, and the [`FormData`](https://developer.mozilla.org/en-US/docs/Web/API/FormData) lifecycle, autonomous custom elements can opt in via [`ElementInternals`](https://html.spec.whatwg.org/multipage/custom-elements.html#the-elementinternals-interface):

```js
class MyField extends HTMLElement {
  static formAssociated = true;

  constructor() {
    super();
    this._internals = this.attachInternals();
    this.attachShadow({ mode: "open" }).innerHTML =
      `<input aria-label="Value" />`;
    this._input = this.shadowRoot.querySelector("input");
    this._input.addEventListener("input", () => {
      this._internals.setFormValue(this._input.value);
      this._internals.setValidity({});
    });
  }
}

customElements.define("my-field", MyField);
```

The WHATWG HTML specification’s [“Faces of custom elements”](https://html.spec.whatwg.org/multipage/custom-elements.html#custom-elements-face-example) section walks through the same concepts: **form owner**, **submission value**, and **reset/restore** hooks via [`formAssociated`](https://html.spec.whatwg.org/multipage/custom-elements.html#dom-elementinternals-form) and [`attachInternals()`](https://html.spec.whatwg.org/multipage/custom-elements.html#dom-attachinternals).

## Framework interoperability: properties, events, and SSR

Frameworks do not “special case” Web Components uniformly. The stable integration contract is boring on purpose:

- **Pass complex data via properties**, not only string attributes — many frameworks need [custom property descriptors](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements#setting_a_custom_elements_properties_in_javascript) or thin wrappers.
- **Communicate outward with DOM events** ([`CustomEvent`](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/CustomEvent) with `composed: true` when you intend the event to escape shadow DOM — see [`Event.composed`](https://dom.spec.whatwg.org/#dom-event-composed)).
- **Avoid breaking SSR** — mismatched HTML, forgotten declarative shadow roots, or client-only constructors that assume `window` are common failure modes.

React historically treated unknown tag names as strings for children; **React 19** improved custom element integration (for example, [Custom Element support in React 19](https://react.dev/blog/2024/12/05/react-19#support-for-custom-elements)). Vue provides [`defineCustomElement`](https://vuejs.org/guide/extras/web-components.html) for publishing Vue SFCs as standards elements. Regardless of stack, **treat your Web Component like a mini-library** with semver, docs, and explicit supported usage.

## When Web Components are a strong fit — and when they are not

**Strong fit**

- **Design systems and embeddable widgets** consumed across multiple stacks (micro-frontends, CMS themes, partner pages).
- **Long-lived leaf components** where shadow style encapsulation removes accidental global CSS coupling.
- **Progressive enhancement** paths where a small surface area upgrades static HTML.

**Weaker fit**

- **Application-wide orchestration** where you already depend on a framework’s reactivity, data loaders, and router — duplicating that inside shadow roots rarely pays off.
- **Frequent cross-cutting visual changes** without a disciplined `::part` / token story — you will fight your own boundary.
- **Teams without test discipline** for accessibility and focus — the platform gives primitives, not guarantees.

## Further reading

- [WHATWG HTML — Custom elements](https://html.spec.whatwg.org/multipage/custom-elements.html)
- [WHATWG DOM — Shadow trees](https://dom.spec.whatwg.org/#shadow-trees)
- [MDN — Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)
- [Chrome Developers — Custom elements v1](https://web.dev/articles/custom-elements-v1) (still useful for mental models and performance notes)

If you adopt Web Components, adopt them as **versioned platform APIs**: document the host contract, test across engines, and treat every `::part` name like an exported symbol — because to your consumers, it is.
