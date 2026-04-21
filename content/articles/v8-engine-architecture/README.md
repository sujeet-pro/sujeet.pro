---
title: 'V8 Engine Architecture: Parsing, Optimization, and JIT'
linkTitle: 'V8 Engine'
description: >-
  V8's four-tier compilation pipeline from Ignition interpreter to TurboFan optimizer — how hidden classes, inline caches, and speculative optimization achieve near-native JavaScript performance, plus Orinoco's concurrent garbage collection strategy.
publishedDate: 2026-01-31T00:00:00.000Z
lastUpdatedOn: 2026-04-21T00:00:00.000Z
tags:
  - javascript
  - runtime
  - v8
  - nodejs
  - event-loop
---

# V8 Engine Architecture: Parsing, Optimization, and JIT

V8's multi-tiered compilation pipeline—Ignition interpreter through TurboFan optimizer—achieves near-native JavaScript performance while maintaining language dynamism. This analysis covers the four-tier architecture (as of V8 12.x / Chrome 120+), the runtime's hidden class and inline caching systems that enable speculative optimization, and the Orinoco garbage collector's parallel/concurrent strategies.

![V8's four-tier compilation pipeline with tier-up thresholds and feedback-driven optimization](./diagrams/four-tier-pipeline-light.svg "V8's four-tier compilation pipeline: Ignition feeds Sparkplug, Maglev, and TurboFan; deopts return execution to Ignition.")
![V8's four-tier compilation pipeline with tier-up thresholds and feedback-driven optimization](./diagrams/four-tier-pipeline-dark.svg)

## Abstract

V8 solves the fundamental tension in dynamic language execution: achieving static-language performance without sacrificing JavaScript's runtime flexibility. The architecture's core insight is **speculative optimization**—assume code behaves predictably based on observed patterns, optimize aggressively for that assumption, and have a safe bailout path when assumptions fail.

**The four-tier pipeline** balances compilation cost against execution speed:

| Tier      | Compilation Speed | Execution Speed     | Default trigger[^thresholds] |
| --------- | ----------------- | ------------------- | ---------------------------- |
| Ignition  | Instant           | Slow (~100× native) | Always                       |
| Sparkplug | ~10μs/function    | Moderate            | ~8 calls                     |
| Maglev    | ~100μs/function   | Fast                | ~500 calls                   |
| TurboFan  | ~1ms/function     | Near-native         | ~6000 calls                  |

[^thresholds]: These thresholds are V8 heuristics — see Intel's [Profile-Guided Tiering in the V8 JavaScript Engine](https://community.intel.com/t5/Blogs/Tech-Innovation/Client/Profile-Guided-Tiering-in-the-V8-JavaScript-Engine/post/1679340) and the V8 flag definitions ([`flag-definitions.h`](https://chromium.googlesource.com/v8/v8/+/master/src/flags/flag-definitions.h)) — adjusted dynamically by feedback stability, OSR pressure, efficiency mode, and profile data. Maglev/TurboFan tier-up resets the counter when feedback shape changes.

**The runtime system** makes speculation viable through:

- **Hidden Classes (Maps)**: Transform dynamic property access into fixed-offset memory loads
- **Inline Caches (ICs)**: Track which object shapes appear at each property access site
- **FeedbackVector**: Store IC data separately from code, enabling safe speculation

**The optimization contract**: If an IC site is monomorphic (single shape), TurboFan generates a fast path with a single map check + direct load. If polymorphic (2-4 shapes), it generates a linear chain of checks. If megamorphic (>4 shapes), optimization is abandoned for that site.

**Deoptimization** is the safety net—when speculation fails at runtime, V8 reconstructs the interpreter frame and resumes in Ignition. This makes aggressive optimization safe because incorrect speculation never produces wrong results, only slower execution.

**Orinoco GC** applies the generational hypothesis (most objects die young) with parallel young-generation collection and concurrent old-generation marking, achieving sub-millisecond pause times in typical workloads.

## The Core Trade-off

JIT (Just-In-Time) compilers face an inherent tension: compilation time steals from execution time. Spending 100ms optimizing a function that runs once wastes 100ms. Spending 0ms optimizing a function that runs a million times wastes cycles on every iteration.

V8's answer is **tiered compilation**—start executing immediately with minimal compilation cost, then progressively recompile hot code with increasing optimization levels. Each tier represents a different point on the compilation-time vs. execution-speed curve.

The key insight enabling this architecture: **JavaScript code exhibits predictable patterns despite being dynamically typed**. Objects created by the same constructor tend to have the same shape. Functions called repeatedly tend to receive the same types. Property accesses at a given source location tend to hit the same object layouts.

V8's runtime system—hidden classes and inline caches—captures these patterns as they emerge during execution. The optimizing compilers then treat this observed behavior as ground truth for speculation, with deoptimization as the safety net when reality diverges from expectation.

## Parsing: Source to Bytecode

Before execution, V8 transforms JavaScript source into bytecode—the canonical representation consumed by all subsequent tiers.

### Scanner and Tokenizer

The scanner consumes UTF-16 source characters and emits tokens—identifiers, operators, literals, keywords. This is a straightforward lexical analysis pass.

### Parser and AST Generation

The parser consumes tokens and builds an Abstract Syntax Tree (AST). V8's parser is hand-written (not generated) for performance and JavaScript's context-sensitive grammar requirements.

### Lazy Parsing: The Startup Optimization

**The problem**: Parsing is expensive. A typical web page loads megabytes of JavaScript, but most functions are never called during initial page render.

**The solution**: V8 employs a two-pass strategy:

1. **Pre-parser (fast pass)**: Identifies function boundaries and validates syntax without building full AST nodes. Runs at ~2x the speed of full parsing.

2. **Full parser (deferred)**: Builds complete AST only when a function is first called.

![Lazy parsing defers full AST construction until function invocation](./diagrams/lazy-parsing-light.svg "Lazy parsing defers full AST construction until the first invocation; the pre-parser only validates syntax and records function boundaries.")
![Lazy parsing defers full AST construction until function invocation](./diagrams/lazy-parsing-dark.svg)

**Edge case—inner functions**: When an outer function is compiled, its inner functions are pre-parsed. If the outer function references variables from an inner function's closure, the pre-parser must track this without building full AST nodes. This is a significant source of parser complexity.

**Trade-off**: Lazy parsing saves startup time but creates a "double parse" cost when functions are eventually called. For functions that will definitely be called immediately, this is wasted work. Chrome 136+ introduces explicit compile hints (`//# allFunctionsCalledOnLoad`) to let developers signal which functions should be eagerly compiled, moving parsing to background threads.

## Ignition: The Interpreter Foundation

Ignition is V8's bytecode interpreter—the first execution tier and the foundation for all subsequent optimization.

### Register Machine Architecture

Ignition uses a **register-based** design (not stack-based like the JVM). Bytecode instructions operate on virtual registers (`r0`, `r1`, etc.) with a dedicated **accumulator** register that serves as an implicit operand for most operations.

**Why registers over stack?** Register machines produce shorter bytecode sequences because operations don't need explicit stack manipulation. The accumulator pattern further compresses bytecode—common operation chains like `a + b - c` keep intermediate results in the accumulator without explicit stores.

### Bytecode Generation

The BytecodeGenerator traverses the AST and emits V8 bytecode. Consider:

```javascript
function incrementX(obj) {
  return 1 + obj.x
}
```

Generated bytecode:

```plain
LdaSmi [1]                      // Load Small Integer 1 → accumulator
Star0                           // Store accumulator → r0
GetNamedProperty a0, [0], [0]   // Load obj.x → accumulator (feedback slot 0)
Add r0, [1]                     // r0 + accumulator → accumulator (feedback slot 1)
Return                          // Return accumulator
```

The bracketed indices (`[0]`, `[1]`) reference slots in the FeedbackVector—this is how Ignition records type information for the optimizing compilers.

### CodeStubAssembler: Cross-Platform Handler Generation

Bytecode handlers (the machine code implementing each instruction) are written in **CodeStubAssembler (CSA)**—a platform-independent C++ DSL that TurboFan compiles to native code for each architecture. This means improvements to TurboFan's backend automatically accelerate the interpreter.

At runtime, the interpreter dispatch loop:

1. Fetches the next bytecode from BytecodeArray
2. Indexes into a global dispatch table
3. Jumps to the handler's machine code

This indirect-threaded dispatch costs ~10-15 cycles per bytecode on modern CPUs.

## Hidden Classes and Inline Caching: The Runtime Foundation

The entire speculative optimization strategy depends on the runtime system's ability to observe predictable patterns in dynamic code. Two mechanisms make this possible.

### Hidden Classes (Maps)

JavaScript objects are dynamic—properties can be added or deleted at any time. A naive implementation requires hash table lookups for every property access (~100+ cycles). V8's insight: most objects in practice have stable, predictable shapes.

**The solution**: Associate every object with a **Hidden Class** (internally called a **Map**). The Map describes:

- Which properties exist
- Their types (where known)
- Their memory offsets within the object

Property access becomes:

1. Load the object's Map pointer (1 instruction)
2. Compare against expected Map (1 instruction)
3. Load from fixed offset (1 instruction)

This transforms O(n) hash lookups into O(1) offset loads.

![Object memory layout with Map pointer and fixed-offset properties](./diagrams/object-memory-layout-light.svg "Each object stores a Map pointer plus its property slots at fixed offsets; the Map carries the DescriptorArray and the TransitionArray.")
![Object memory layout with Map pointer and fixed-offset properties](./diagrams/object-memory-layout-dark.svg)

### Map Transitions: Shape Evolution

Maps form a **transition tree**. When properties are added, V8 follows (or creates) transitions to new Maps:

```javascript
const obj = {} // Map M0: empty
obj.x = 1 // Map M1: {x} (transition from M0)
obj.y = 2 // Map M2: {x, y} (transition from M1)
```

**Critical implication**: Property addition order matters.

```javascript
const a = {}
a.x = 1
a.y = 2 // Map path: M0 → M1(x) → M2(x,y)
const b = {}
b.y = 1
b.x = 2 // Map path: M0 → M3(y) → M4(y,x)
```

Objects `a` and `b` have different Maps despite identical property sets. A function optimized for `a`'s Map will deoptimize when passed `b`.

![Map transition tree showing how property addition order forks the Map graph](./diagrams/map-transition-tree-light.svg "Property addition order forks the Map transition graph; identical property sets reached through different paths land on different Maps.")
![Map transition tree showing how property addition order forks the Map graph](./diagrams/map-transition-tree-dark.svg)

**Best practice**: Initialize all properties in constructors, in consistent order.

### Inline Caches and FeedbackVector

**Inline Caches (ICs)** track which Maps appear at each property access site. The data is stored in a per-function **FeedbackVector**—a separate array with slots for each IC site.

As Ignition executes, it populates FeedbackVector slots with observed Maps. This separation of feedback from code is deliberate—it enables sharing optimized code across closures while maintaining per-closure type information.

### IC States: Quantifying Predictability

| State             | Shapes Seen | Access Cost   | Optimization Impact                            |
| ----------------- | ----------- | ------------- | ---------------------------------------------- |
| **Uninitialized** | 0           | N/A           | No feedback yet                                |
| **Monomorphic**   | 1           | ~3 cycles     | Ideal—single map check + direct load           |
| **Polymorphic**   | 2-4         | ~10-20 cycles | Linear chain of map checks                     |
| **Megamorphic**   | >4          | ~100+ cycles  | Global stub cache; often prevents optimization |

![Inline cache state lifecycle from uninitialized through monomorphic, polymorphic, and megamorphic](./diagrams/ic-state-lifecycle-light.svg "Each IC site progresses one-way through the state lattice; once it reaches megamorphic, TurboFan typically refuses to optimize the containing function.")
![Inline cache state lifecycle from uninitialized through monomorphic, polymorphic, and megamorphic](./diagrams/ic-state-lifecycle-dark.svg)

**The megamorphic cliff**: When an IC exceeds 4 shapes, V8 abandons local caching and falls back to a global hashtable. Performance degrades 10-50x, and TurboFan typically refuses to optimize the containing function.

**Real-world example**: A function processing heterogeneous API responses where each endpoint returns differently-shaped objects will quickly go megamorphic. Solutions include normalizing shapes early or splitting into shape-specific functions.

## Sparkplug: The Baseline JIT

Introduced in Chrome 91 (May 2021) — see [Sparkplug — a non-optimizing JavaScript compiler](https://v8.dev/blog/sparkplug) — Sparkplug bridges the performance gap between interpretation and optimization.

### Design Philosophy

Sparkplug optimizes for **compilation speed**, not execution speed. The V8 team describes its compiler as essentially "a switch statement inside a for loop":

1. For each bytecode instruction
2. Emit the corresponding machine code template
3. No analysis, no optimization, no IR

**Tier-up trigger**: ~8 invocations, no feedback required.

### Key Design Decisions

**Compiles from bytecode, not source**: Sparkplug reuses all the work the parser and BytecodeGenerator already did. This is why it's fast—most of the "compilation" already happened.

**No Intermediate Representation**: Unlike optimizing compilers that build graphs for analysis, Sparkplug generates machine code directly in a single linear pass. Complex operations emit calls to pre-compiled builtins.

**Interpreter-compatible frame layout**: Sparkplug uses the same stack frame structure as Ignition. This enables trivial On-Stack Replacement (OSR)—mid-execution switches between tiers require no frame reconstruction.

### Performance Characteristics

Compilation: ~10μs per function (orders of magnitude faster than TurboFan's ~1ms). On benchmarks the V8 team reported ~5–15% improvement on real-world page workloads when Sparkplug shipped — see [Sparkplug — a non-optimizing JavaScript compiler](https://v8.dev/blog/sparkplug). On microbenchmarks the gap is larger (Speedometer ~5–10%, JetStream ~15%); per the [Maglev launch post](https://v8.dev/blog/maglev) Sparkplug ends up roughly 41% faster than Ignition on Speedometer in isolation.

Sparkplug's value is in eliminating interpreter dispatch overhead. The generated code still performs all the same runtime checks—it's just native code doing it instead of bytecode handlers.

**Trade-off**: Sparkplug code is larger than bytecode and less efficient than optimized code. For short-lived or rarely-called functions, Ignition's lower memory footprint may be preferable. V8's heuristics handle this automatically.

## Maglev: The Mid-Tier Optimizer

Introduced in Chrome 117 (September 2023), [Maglev](https://v8.dev/blog/maglev) closes the compilation-speed vs. execution-speed gap between Sparkplug and TurboFan.

### Why a Mid-Tier?

The Ignition/TurboFan gap was too wide. TurboFan produces excellent code but takes ~1ms to compile. For functions that run hundreds of times but not thousands, TurboFan's compilation cost exceeds its benefits. Maglev compiles ~10x faster than TurboFan while producing code ~2x faster than Sparkplug.

**Tier-up trigger**: ~500 invocations with stable feedback. If feedback changes (new shapes appear), the counter resets.

### Architecture: CFG over Sea of Nodes

Maglev deliberately uses a traditional SSA (Static Single-Assignment) CFG (Control-Flow Graph) rather than TurboFan's Sea of Nodes IR. The V8 team found that for JavaScript's heavily effectful operations, Sea of Nodes' theoretical advantages didn't materialize in practice—most nodes ended up chained together anyway.

The CFG approach provides:

- **Faster compilation**: No complex graph scheduling
- **Easier debugging**: Linear control flow is human-readable
- **Simpler implementation**: Traditional compiler textbook techniques apply directly

### Optimization Capabilities

**Feedback-driven specialization**: Maglev consumes FeedbackVector data to emit specialized code. A property access `o.x` with monomorphic feedback becomes a map check + direct offset load.

**Representation selection**: Numbers can be unboxed to raw machine integers/floats in registers, avoiding heap allocation overhead for arithmetic-heavy code.

**Inlining**: Limited function inlining for small, hot callees.

**What Maglev skips**: Loop unrolling, escape analysis, advanced load elimination—these are TurboFan's domain.

### Performance Impact

V8's published [Maglev benchmarks](https://v8.dev/blog/holiday-season-2023) at the Chrome 117 launch:

- JetStream 2: +8.2%
- Speedometer 2: +6%
- Energy: −10% during Speedometer runs, −3.5% on JetStream

For typical web workloads, Maglev handles most optimization needs. TurboFan activates only for genuinely hot loops and compute-intensive functions.

## TurboFan: The Top-Tier Optimizer

TurboFan generates the fastest possible code for hot functions. It's expensive—~1ms compilation time—but produces code that approaches native performance.

**Tier-up trigger**: ~6000 invocations with stable feedback.

### The Sea of Nodes IR (Historical)

TurboFan was built on **Sea of Nodes (SoN)**—an IR where nodes represent operations and edges represent dependencies (data, control, and effect). Unlike CFG-based IRs, nodes without dependency chains are "free-floating," theoretically enabling aggressive reordering and optimization.

**Why it seemed like a good idea**: SoN works excellently for static languages like Java (where it originated). Pure operations can float freely, enabling powerful global optimizations.

**Why it failed for JavaScript**: In JavaScript, almost every operation is potentially effectful—property access can trigger getters, operators can call `valueOf()`. This forced most nodes onto the effect chain, which effectively recreated CFG constraints anyway.

The result:

- Graphs were difficult to read and debug
- Poor cache locality (nodes scattered in memory)
- Compilation was ~2x slower than CFG approaches
- Optimizations requiring control-flow reasoning became harder, not easier

### Turboshaft: The CFG Replacement

Starting in 2023 (Chrome 120+), V8 has been migrating TurboFan's backend to **Turboshaft**—a CFG-based IR. Per the V8 team's [Land ahoy: leaving the Sea of Nodes](https://v8.dev/blog/leaving-the-sea-of-nodes) post (March 2025), Turboshaft already runs the entire JavaScript backend of TurboFan and the entire WebAssembly compilation pipeline. Two areas still ride on Sea of Nodes: the builtin pipeline (in transition) and the JavaScript frontend (the bytecode → IR phase that the optimizer consumes).

**Results**: Compilation time roughly halved versus the Sea of Nodes backend, with equal or better code quality.

The remaining JavaScript frontend will be replaced by the **Turbolev** project, which feeds Maglev's CFG/SSA graph directly into Turboshaft's optimizer instead of building a fresh Sea of Nodes graph.

### TurboFan Optimization Capabilities

**Speculative optimizations based on feedback**:

- Type-specialized arithmetic (Int32Add instead of generic Add)
- Inline property access (map check + offset load)
- Function inlining

**Advanced analyses**:

- **Escape analysis**: Allocate objects on stack when they don't escape
- **Loop-invariant code motion**: Hoist computations out of loops
- **Redundancy elimination**: Remove duplicate map checks
- **Dead code elimination**: Remove unreachable paths

**Representation selection**: Choose optimal numeric representations:

- **Smi** (tagged small integer) for values in the Smi range (see the note below for exact bounds)
- **HeapNumber** for larger integers or floats
- Raw Int32/Float64 in registers when unboxing is profitable

> [!NOTE]
> **Smi range depends on architecture and pointer compression.** With [pointer compression](https://v8.dev/blog/pointer-compression) enabled — the default on 64-bit since V8 8.0 (2020) — Smi is a 31-bit signed integer, roughly ±2³⁰ (~±1.07B). Without pointer compression on 64-bit, Smi expands to a full 32-bit signed integer ([−2³¹, 2³¹−1]). On 32-bit builds it is always 31-bit signed.

### Pipeline Walkthrough

![TurboFan compilation pipeline with Turboshaft backend](./diagrams/turbofan-pipeline-light.svg "TurboFan pipeline: bytecode and feedback flow into the graph builder; scheduling, register allocation, and code generation now run on Turboshaft.")
![TurboFan compilation pipeline with Turboshaft backend](./diagrams/turbofan-pipeline-dark.svg)

## Deoptimization: The Safety Net

Speculative optimization is only safe because deoptimization provides a reliable escape hatch. When an assumption fails at runtime, V8 reconstructs the interpreter state and resumes in Ignition.

### Why Deoptimization is Not Failure

Deoptimization is designed into V8's architecture, not a bug. It enables aggressive speculation—if V8 had to guarantee correctness without bailouts, it couldn't optimize nearly as aggressively.

**Frequency in practice**: Historical V8 measurements on the Octane suite found roughly half of the benchmarks contained more than ~5 deoptimization checks per 100 optimized instructions[^octane-deopt]. Real-world code typically stabilizes after warmup, with deoptimizations becoming rare.

[^octane-deopt]: See Vyacheslav Egorov's [What's up with monomorphism?](https://mrale.ph/blog/2015/01/11/whats-up-with-monomorphism.html) for deopt-density measurements; the absolute number depends on V8 version and benchmark revision and is included here as an order-of-magnitude reference.

### Common Deoptimization Reasons

| Reason                      | Trigger                                 | Example                                        |
| --------------------------- | --------------------------------------- | ---------------------------------------------- |
| `kWrongMap`                 | Object shape changed                    | Function optimized for `{x}` receives `{y, x}` |
| `kNotASmi`                  | Expected small integer, got heap number | `x + 1` where `x` becomes a float              |
| `kOutOfBounds`              | Array access beyond length              | `arr[i]` where `i >= arr.length`               |
| `kOverflow`                 | Integer arithmetic overflow             | Addition exceeds the Smi range (see Smi note above) |
| `kHole`                     | Sparse array access                     | Accessing uninitialized array element          |
| `kInsufficientTypeFeedback` | Optimized before feedback stabilized    | Polymorphic site went megamorphic              |

### Eager vs. Lazy Deoptimization

**Eager**: Check fails in the currently executing optimized code. Immediate bailout.

**Lazy**: External change invalidates assumptions (e.g., prototype modification). The optimized function is marked for deoptimization and will bailout on next invocation.

### Frame Translation: The Mechanical Challenge

Deoptimization cannot restart from the beginning—side effects may have occurred. It must resume at the exact bytecode offset corresponding to the failed check.

**The process**:

1. **Capture state**: Serialize CPU registers and stack values into FrameDescription
2. **Translate**: Map optimized frame layout to interpreter frame layout (TurboFan pre-generates this mapping)
3. **Replace**: Pop optimized frame, push interpreter frame, jump to bytecode offset

![Deoptimization sequence from optimized check failure to interpreter resumption](./diagrams/deoptimization-flow-light.svg "Eager deopt path — failed speculation captures register state, translates to an interpreter frame, updates feedback, and resumes Ignition at the same bytecode offset.")
![Deoptimization sequence from optimized check failure to interpreter resumption](./diagrams/deoptimization-flow-dark.svg)

**Why Sparkplug's frame compatibility matters**: Sparkplug uses Ignition's frame layout, making OSR trivial. Maglev/TurboFan use different layouts, requiring full frame translation.

### Performance Impact

Deoptimization cost: ~2x to 20x slowdown for that invocation, depending on function complexity.

**The real cost**: Not the single deoptimization, but the feedback pollution it causes. A function that deoptimizes repeatedly may never reach TurboFan, staying in Maglev or even Sparkplug.

## Orinoco: The Garbage Collector

[Orinoco](https://v8.dev/blog/trash-talk) is V8's garbage collection system—designed to minimize pause times while maintaining memory efficiency.

### The Generational Hypothesis

**Core observation**: Most objects die young. A typical web application allocates thousands of short-lived objects (event handlers, intermediate computations, closures) for every long-lived one (cached data, application state).

**Design implication**: Optimize for the common case. Collect young objects frequently and cheaply; collect old objects rarely and thoroughly.

### Heap Structure

| Generation | Size                   | Collection Frequency | Algorithm                     |
| ---------- | ---------------------- | -------------------- | ----------------------------- |
| **Young**  | 1-16 MB (configurable) | Every few ms         | Parallel Scavenge (copying)   |
| **Old**    | Heap limit - young gen | Every few seconds    | Concurrent Mark-Sweep-Compact |

Young generation is further divided:

- **Nursery**: Brand-new allocations
- **Intermediate**: Survived one scavenge

![Orinoco heap structure: young generation (nursery + intermediate) feeds into the old generation; old gen runs concurrent mark-sweep with optional parallel compact](./diagrams/orinoco-heap-structure-light.svg "Orinoco heap: surviving objects pass nursery → intermediate before promotion; old gen marking and sweeping run on background threads, with compaction the only full-pause phase.")
![Orinoco heap structure: young generation (nursery + intermediate) feeds into the old generation; old gen runs concurrent mark-sweep with optional parallel compact](./diagrams/orinoco-heap-structure-dark.svg)

### Young Generation: Parallel Scavenger

**Algorithm**: Semi-space copying. The young generation has two equal-sized spaces (From-Space and To-Space). Live objects are copied from From to To; dead objects are implicitly reclaimed.

**Why copying works for young gen**: With high mortality rates, copying is efficient—you only pay for survivors. Dead objects (the majority) require zero work.

**Orinoco innovation**: **Parallel scavenging**. Multiple threads scan roots and copy survivors simultaneously. Pause time scales inversely with CPU cores.

**Promotion**: Objects surviving two scavenges are promoted to old generation, not copied again. This assumes the generational hypothesis—surviving twice suggests longevity.

### Old Generation: Concurrent Mark-Sweep-Compact

**Three-phase algorithm**:

1. **Mark**: Traverse object graph from roots, mark reachable objects
2. **Sweep**: Add unmarked object memory to free lists
3. **Compact**: Defragment by moving live objects together (optional, triggered by fragmentation thresholds)

**Orinoco's parallelism strategy**:

| Phase   | Execution Model                 | Pause Required                 |
| ------- | ------------------------------- | ------------------------------ |
| Mark    | Concurrent (background threads) | Brief (~1ms) for root scanning |
| Sweep   | Concurrent (background threads) | None                           |
| Compact | Parallel (all threads)          | Full pause (but shared work)   |

**Write barriers**: When JavaScript creates/modifies object pointers during concurrent marking, write barriers record these changes so the GC maintains a consistent view.

### Advanced Techniques

**Black allocation**: Objects promoted to old generation are pre-marked as live ("black"). This skips them in the next marking cycle—a valid optimization because promotion implies expected longevity.

**Remembered sets**: Track old→young pointers so young generation scavenges don't scan the entire old generation. Orinoco uses per-page granularity for parallel-friendly processing.

**Idle-time GC**: Chrome signals idle periods to V8, which performs opportunistic GC work (incremental marking, deferred sweeping). On a memory-heavy app like Gmail, [V8's measurements](https://v8.dev/blog/free-garbage-collection) show idle-time collection can reclaim up to ~45% of the JavaScript heap with no user-visible jank.

> [!NOTE]
> **Direction of travel — Minor Mark-Sweep.** V8 has been working on a non-moving young-generation collector ([MinorMS](https://wingolog.org/archives/2023/12/07/the-last-5-years-of-v8s-garbage-collector)) to support conservative stack scanning and to reduce copying overhead at higher young-gen sizes. Parallel Scavenge remains the production default at the time of writing; treat MinorMS as the trajectory, not the current code path.

### Performance Characteristics

Typical pause times:

- Minor GC (scavenge): <1ms
- Major GC (mark-sweep): 1-10ms (most work concurrent)
- Compaction: 10-50ms (rare, only when fragmented)

**Trade-off**: Concurrent GC requires write barriers, adding ~5% overhead to pointer-mutating operations. This is worth it for the pause time reduction.

## Pipeline Evolution

V8's architecture has evolved through three major eras, each addressing the limitations of its predecessor.

### Era 1: Full-codegen + Crankshaft (2008-2017)

**Full-codegen**: Fast baseline compiler generating unoptimized machine code directly from AST. No bytecode.

**Crankshaft**: Optimizing compiler for hot functions.

**The problem—performance cliffs**: Crankshaft could only optimize a subset of JavaScript. Using `try-catch`, certain `arguments` patterns, or `with` statements caused permanent bailouts. Functions would be stuck in slow Full-codegen code forever, with no recovery path.

### Era 2: Ignition + TurboFan (2017-2021)

**The fix**: Bytecode as the canonical representation. Ignition interprets bytecode; TurboFan optimizes from bytecode. This decoupled optimization from parsing and enabled full-language optimization.

**New problem**: The compilation gap. TurboFan's ~1ms compilation cost meant functions needed thousands of invocations to justify optimization.

### Era 3: Four-Tier Pipeline (2021-Present)

**The fix**: Intermediate tiers to smooth the performance curve.

| Year  | Addition   | Purpose                                     |
| ----- | ---------- | ------------------------------------------- |
| 2021  | Sparkplug  | Eliminate interpreter dispatch overhead     |
| 2023  | Maglev     | Quick optimizations without TurboFan's cost |
| 2023+ | Turboshaft | Replace TurboFan's Sea of Nodes backend     |

### Future: Turbolev

The **Turbolev** project (in development as of 2025) aims to use Maglev's CFG-based IR as input to Turboshaft's backend, potentially replacing TurboFan entirely.

## Conclusion

V8's performance emerges from the interplay between its components:

- **Tiered compilation** provides fast startup while enabling peak performance for hot code
- **Hidden classes and ICs** make predictable patterns observable, enabling speculative optimization
- **Deoptimization** makes aggressive speculation safe
- **Orinoco GC** minimizes pause times through parallelism and concurrency

The architecture's evolution—from performance cliffs to smooth gradients, from Sea of Nodes to CFG—tracks measured production pain rather than aesthetic preference. Each tier and each backend swap landed because the previous shape underperformed on real workloads, not because it was theoretically appealing.

## Appendix

### Prerequisites

- Understanding of JIT compilation concepts (interpreter vs. compiler trade-offs)
- Familiarity with basic compiler terminology (AST, IR, bytecode)
- Knowledge of JavaScript's dynamic typing model

### Summary

- V8 uses four compilation tiers: Ignition (interpreter) → Sparkplug (baseline) → Maglev (mid-tier) → TurboFan (top-tier)
- Hidden classes (Maps) enable O(1) property access by describing object shapes
- Inline caches track shapes at each property access site; megamorphic (>4 shapes) sites prevent optimization
- Deoptimization safely reverts to interpreter when speculation fails
- Orinoco GC achieves <1ms pauses for young generation through parallel scavenging
- Turboshaft is replacing TurboFan's Sea of Nodes backend with CFG-based IR

### Terminology

- **AST (Abstract Syntax Tree)**: Tree representation of source code structure
- **CFG (Control-Flow Graph)**: IR representing program as basic blocks connected by control edges
- **Deoptimization**: Reverting from optimized code to interpreter when assumptions fail
- **FeedbackVector**: Per-function array storing inline cache data for optimization
- **Hidden Class / Map**: V8's internal object shape descriptor enabling fast property access
- **IC (Inline Cache)**: Mechanism tracking object shapes at property access sites
- **IR (Intermediate Representation)**: Compiler's internal code representation between source and machine code
- **JIT (Just-In-Time)**: Compilation strategy that compiles code during execution
- **Megamorphic**: IC state when >4 different shapes observed; optimization typically abandoned
- **Monomorphic**: IC state when exactly 1 shape observed; optimal for speculation
- **OSR (On-Stack Replacement)**: Switching between tiers mid-function-execution
- **Polymorphic**: IC state when 2-4 shapes observed; still optimizable with shape checks
- **Sea of Nodes**: Graph-based IR where nodes represent operations and edges represent dependencies
- **Smi (Small Integer)**: V8's tagged integer representation. 31-bit signed (~±2³⁰) under pointer compression (default on 64-bit since V8 8.0); 32-bit signed on 64-bit builds without pointer compression
- **SSA (Static Single-Assignment)**: IR form where each variable is assigned exactly once
- **Turboshaft**: V8's new CFG-based backend replacing Sea of Nodes in TurboFan

### References

#### Official V8 Documentation

- [V8 Ignition Documentation](https://v8.dev/docs/ignition) - Interpreter architecture
- [V8 TurboFan Documentation](https://v8.dev/docs/turbofan) - Top-tier optimizer
- [V8 Hidden Classes](https://v8.dev/docs/hidden-classes) - Object shape tracking

#### V8 Blog (Primary Source)

- [Launching Ignition and TurboFan](https://v8.dev/blog/launching-ignition-and-turbofan) - 2017 architecture rewrite
- [Sparkplug — a non-optimizing JavaScript compiler](https://v8.dev/blog/sparkplug) - Baseline JIT introduction (2021)
- [Maglev - V8's Fastest Optimizing JIT](https://v8.dev/blog/maglev) - Mid-tier compiler (2023)
- [Trash talk: the Orinoco garbage collector](https://v8.dev/blog/trash-talk) - GC architecture
- [Land ahoy: leaving the Sea of Nodes](https://v8.dev/blog/leaving-the-sea-of-nodes) - Turboshaft migration
- [Static Roots: Objects Allocated at Compile Time](https://v8.dev/blog/static-roots) - 2024 optimization
- [Explicit Compile Hints](https://v8.dev/blog/explicit-compile-hints) - Chrome 136+ feature

#### Core Maintainer Content

- [An Introduction to Speculative Optimization in V8](https://benediktmeurer.de/2017/12/13/an-introduction-to-speculative-optimization-in-v8/) - Benedikt Meurer
- [V8 Behind the Scenes](https://benediktmeurer.de/2017/03/01/v8-behind-the-scenes-february-edition/) - Benedikt Meurer
- [Understanding V8's Bytecode](https://medium.com/dailyjs/understanding-v8s-bytecode-317d46c94775) - Franziska Hinkelmann

#### Technical Deep Dives

- [The Sea of Nodes](https://darksi.de/d.sea-of-nodes/) - IR architecture explanation
- [Monomorphism in JavaScript](https://www.builder.io/blog/monomorphic-javascript) - IC optimization guide
