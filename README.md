README.md

## React Super Simple Scroller (RS3)

RS3 is yet another React infinite scroller, but with a twist.

This product is often referred to as the “scroller” in the documentation below.

This product is in beta.

## Features

- vertical or horizontal scrolling
- single or multiple rows and columns (dynamic)
- dynamic resizing
- nested scrollers
- self-configuring
- support for oversized cells (larger than the viewport)
- fixed or variable axis cell length, and uniform cross-axis cell length
- dynamic changes to scroller cradle content through function calls
- dispatch synthetic events to cells
- placeholder cells while the host is fetching, in both directions, filled in place; the host may supply its own

Designed for modern browsers.

The compiled build is ~52KB.

## Demo

[Demo video](https://github.com/user-attachments/assets/deb7b2e1-55fc-40b8-b87b-39562e85d55f)

## Usage
Here is the simplest base case.
```
import Scroller from 'react-super-simple-scroller'

// create a container for the scroller with appropriate style context
// the Scroller viewport (outer div) uses position:'absolute', inset:0
const containerStyles = {
  border: '1px solid gray',
  position:'relative',
  height: '100%',
  width: '100%',
  minWidth: '200px', // protect against width 0
  minHeight: '200px', // protect against height 0
} as CSSProperties

const cellStyles = {
  border: '3px solid gray',
  borderRadius: '6px',
  padding: '3px',
  backgroundColor: 'white',
  width: '100%',
  height: '100%',
} as CSSProperties

const CellComponent = (props) => {
  const {id} = props
  return <div style = {cellStyles}>
    item # {id}
  </div>
}

const ScrollerDemo = (props) => {
  const cellDimensionsRef = useRef({
    maxWidth:300, minWidth:200, maxHeight:40, minHeight:30
  })
  
  const fetchCells = useCallback( async (startCode, referenceID, count)=>{
    const list = []
    if (referenceID >=0 && referenceID <=500) {
      if (startCode == 'at') {
        let processcount = 0
        for (let id = referenceID;id <= 500; id++) {
          processcount++
          list.push({
            id,
            component: <CellComponent id = {id} />,
          })
          if (processcount === count) break
        }
      } else if (startCode == 'after') {
        let processcount = 0
        for (let id = referenceID + 1;id <= 500; id++) {
          processcount++
          list.push({
            id,
            component: <CellComponent id = {id} />,
          })
          if (processcount === count) break
        }
      } else if (startCode == 'before') {
        let processcount = 0
        for (let id = referenceID -1;id >= 0; id--) {
          processcount++
          list.push({
            id,
            component: <CellComponent id = {id} />,
          })
          if (processcount === count) break
        }
      }
    }
    return list
  },[])

  return <div style = {containerStyles}>
    <Scroller 
      // orientation = 'vertical' (the default)
      // layout = 'uniform' (the default)
      seedReferenceID = {250}
      cellDimensions = {cellDimensionsRef.current}
      fetchCells = {fetchCells}
    />
  </div>
}
```
The package ships its TypeScript declarations. `FetchCells` (the signature of `fetchCells`), `CellPack` (one returned item: `{id, component}`) and `ReactSuperSimpleScrollerProps` are exported: `import Scroller, { FetchCells } from 'react-super-simple-scroller'`.

Note that the scroller lays out in the space its container gives it. `cellsPerBand` is never below 1: a viewport narrower than one cell still takes one cell per band, and the cradle overflows across the axis. The cradle is laid out again whenever the viewport is resized, so a container that has no size at mount is laid out once it has one. The `cellDimensions` fields the cradle divides by must be above zero (see below).

## Technology

React:
- [function components](https://www.robinwieruch.de/react-function-component/)
- [portals](https://react.dev/reference/react-dom/createPortal)

Typescript:
- [IntersectionObserver](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
- [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver)
- [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
- [DOM manipulation](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/DOM_scripting)

## Design

(_Note: this design section uses terminology for vertical orientation. Analogous terminology applies to the horizontal orientation_)

### Motivation

The motivation for the design is to rely on normal DOM layout rather than the usual `transform:translate` approach for the scroller cradle (which contains the visible rolling content elements). Layout provides more flexibility and less calculation than the translate approach. Layout, being a core feature of browsers, is also fast.

### Structure

Layout usage is accomplished by defining a zero-height _axis_ element which is maintained in a position near the top of the _viewport_ element. Two absolutely positioned child block elements are attached to this axis: the _head block_ above (`bottom:0`), and the _tail block_ below (`top:0`). Content added to the head block naturally expands upward, above the axis; content added to the tail block naturally expands downward, below the axis.

The axis is the only element for which position is maintained with `transform:translate`. The axis position is relative to the _scrollblock_ of the _viewport_.

The head and tail blocks contain a set of child _band_ elements (light one-row CSS _grids_) as needed. The bands contain one or more _container_ elements, as needed, which contain the host-provided cell React components.

The cell `container` elements are created by the scroller (with `createElement`) when creating _portals_ (`createPortal(component, container, key`). The portals are rendered to React’s virtual DOM as a single list in a hidden div, which ties the rendered components to the containers. Then the containers are placed, and moved, as needed within the scroller cradle using standard DOM manipulation. Moving the container elements does not disturb the React component states (with the exception of scroll positions — see below).

Finally, a number of one-pixel-height _trigger_ elements are strategically placed, and monitored by `IntersectionObserver` to generate the DOM manipulations required to maintain the illusion of a smooth flow of content while scrolling.

To inspect this structure in the browser, look for element `data-type` attributes with the following values:
- viewport
- scrollblock
- axis
- headblock
- headblock-overflow-trigger
- lead-headblock-band
- lead-headblock-band-backward-trigger
- tailblock
- lead-tailblock-band
- lead-tailblock-band-forward-trigger
- lead-tailblock-band-end-trigger
- tailblock-overflow-trigger
- band
- portal-container
- virtual-cradle

The terms “forward” and “backward” relate to the motion of the axis in relation to the cradle bands. (When the axis moves backward in relation to the bands, the bands move forward in relation to the axis.)

Note that as a simplification the scroller does not synchronize cradle content with the start or end of the scrollblock. Instead, the length of the scrollblock is set to 1M pixels, and the scrollbar is hidden. When the start or end of scrolling data is reached, scrolling is interrupted, and the visible cells are appropriately positioned in relation to the viewport. Every time scrolling stops, the cradle is repositioned to the _center_ of the scrollblock. 

Enough feedback is available from the scroller (and presumably from the underlying dataset) to allow the host to decorate the viewport in ways that are informative for end users.

### Operation

The scroller startup involves loading the initial cell data into the scroller, followed by enabling and monitoring `IntersectionObserver` element observations. 

As intersections change (typically through scrolling), DOM manipulation operations are triggered. Each set of DOM manipulations involves disconnecting the `IntersectionObserver`, performing the DOM manipulations, then reconnecting the `IntersectionObserver`. The act of reconnecting the observer triggers a full set of intersection observations, which allows for immediate evaluation as to further DOM manipulations that may be required. And so the cycle continues.

Resizing similarly disconnects the `IntersectionObserver`, performs DOM manipulations, and reconnects the `IntersectionObserver`.

Before the `IntersectionObserver` is reconnected, the scroller attempts to add content from the host (see `fetchCells` below) to the currently leading edge of the cradle as needed, and it trims content from the trailing edge.

Most commonly, when scrolling, `band` elements are attached with child `container` elements to the moving leading edge of the cradle. Each `band` is then progressively moved closer to the axis, “jumps” the axis, and continues its migration to the trailing edge, where it is finally trimmed away.

### Self-configuration

Very few setup parameters are required from the host to get the scroller started. These include: `orientation` (‘vertical’ | ‘horizontal’), `layout` (‘uniform’ | 'variable'), `cellDimensions` (`minWidth`, `maxWidth`, `minHeight`, `maxHeight`), `seedReferenceID` (a non-empty string, or a finite number), and `fetchCells` (a host-provided function called by the scroller to fetch content for the cradle as needed).

With this information the scroller is able to configure and populate the cradle (and modify the configuration with resizing or parameter updates).

Then, on an ongoing basis, the scroller trims bands from the trailing edge of the cradle as it moves, and adds bands to the leading edge.

In particular, owing to the open-ended scroll allowed by the oversize scrollblock, and to the use of the layout approach, the scroller does not need to know about the scope of the list, nor about “average” cell sizes and such.

See notes about the required parameters, and other available parameters, below.

### Unique cell referenceID's

RS3 requires every component received from the host to be associated with a unique (to the cradle) referenceID — a finite number or a non-empty string. It can be anything from a host array index to a database record's non-compound surrogate key. Ids of the form `_~_…_~_` (a string that opens and closes with `_~_`) are the scroller's own, and are refused from the host wherever an id is checked; `has` answers `false` for one, with no report. This is enforced. A cellPack with a duplicate id (or an invalid cellPack) provided to the scroller will cause loading of the current cellPack list to be aborted.

This allows the `fetchCells` function to be straightforward. The parameters of the function are `fetchCells(startCode, referenceID, count)`. The `startCode` value can be `'at'`, `'after'` or `'before'`. The referenceID is the reference from which the returned cells should be selected. The `fetchCells` return value must be an array containing _cellPacks_ of items up to the `count` number (any extra items will be ignored). 

Each cellPack is an object with two properties: `id`, and `component`. The `id` must be unique (to the cradle), and the component value must pass the `React.isValidElement` test.

Returning an empty array signals to the scroller that there is nothing more that way: on `'before'` the beginning of the data has been reached, on `'after'` the end, and on `'at'` there is nothing at the reference.

`startCode` names where the returned batch starts, relative to `referenceID` in list order. It is a relation between items, not the name of an SDK method. `'at'` is inclusive: the batch begins with the reference item. `'after'` and `'before'` are exclusive: the batch begins with the item next to the reference, on that side of it. **`'before'` returns the items before the reference nearest-first** (REF−1, REF−2, …), because the scroller prepends them one by one. A host that pages backward with an ascending query (for example Firestore's `endBefore` with `limitToLast`) corrupts the head of the cradle silently, with no error to show for it: page backward with a reverse-ordered query and `startAfter` instead. For Firestore: `'at'` → `startAt`, `'after'` → `startAfter`, `'before'` → a reverse-ordered query with `startAfter`. `count` is a maximum on every code. A short batch is not taken as the end: the scroller asks again from the cell now at that end of the cradle (see *Metering the feed* below). An empty array is the end of the data that way, and an empty array on `'at'` leaves the cradle empty, with nothing asked `'after'` or `'before'`.

The `'at'` call is the opening request, made for the scroller's `seedReferenceID` parameter (or for the referenceID passed to `fetchCradleCells`): the cradle starts from what it returns. Its `count` is the number of cells the cradle holds after the axis, so it is usually greater than 1: return up to `count` items starting at the reference, and the `'after'` request that follows asks only for what is still short (a host that returns one item is still filled by that request). Host-returned `'after'` items are added to the tailblock, and `'before'` items are added to the headblock.

### Performance

The scroller waits synchronously for a response from each `fetchCells` call. Therefore if there is much latency in those responses, the performance of the scroller can deteriorate. If your cell content is heavy, or delayed, you might consider returning a light cellFrame component instead, whose job it is to load the substantial content asynchronously. You might even consider using `requestIdleCallback` for that asynchronous load.

The scroller shows its own placeholder cells while a fetch is out (see **Placeholders** below), so the list keeps moving while the host is slow; a host that wants the placeholder to carry something of its own (a skeleton of the cell, a message) supplies it as `operations.placeholder`.

## Properties

Below are the properties that can be passed to RS3.

Note that the object and function properties are tested by RS3 for object identity changes. If a change is detected, then RS3 resets, requesting new cellPacks for all cell id’s around the current axisReferenceID.

Most of the time you will want to avoid this by using `useRef`, `useState` and `useCallback` to store your parameters. On the other hand, if you want to change parameters, make sure that you pass an object with a new identity for the new parameter.

RS3 is responsive to all parameter changes other than `calls` and `callbacks`. A change to `technical` is read the next time each of its timers is set.

### Required

The following properties are required.

|property|details|
|:-----|:-----|
|orientation: ’vertical’ &vert; ‘horizontal’|the scrolling axis (default ‘vertical'). An absent value (`undefined` or `null`) is the default. Any other value, including one in another case (`'Vertical'`), is replaced by the last good value (at mount, the default) and reported to the `warning` callback|
|layout: ’uniform’ &vert; ‘variable’|’variable' allows expandability along the scrolling axis (default ‘uniform'). An absent value is the default, and any other is replaced and reported as for `orientation`|
|cellDimensions: {<br>&nbsp; minWidth, maxWidth,<br>&nbsp; minHeight, maxHeight<br>}|integers, which can be combined to achieve various layout effects. Each is a finite number, not below zero. A field the orientation and layout read must be present (a uniform layout never reads the minimum along the axis), and the two the cradle divides by must be above zero: the minimum across the axis, and along it the maximum in a uniform layout or the minimum in a variable one. A field that breaks any of these, absent or bad, is replaced by its last good value and reported to the `warning` callback. Until a field has had a good value (at mount) nothing can stand in for it: it is reported to the `error` callback and left out, so a list mounted without a field the cradle divides by lays out nothing until one arrives. A value equal to the last good one, field by field, changes nothing, even in a new object|
|seedReferenceID: number &vert; string|the referenceID the list opens at: RS3 asks for it with `'at'`, then for the cells after and before it|
|fetchCells: Function|host-provided callback function; parameters: (startCode, referenceID, count, context). `context` is `{attempt, signal}`: see **Placeholders** below|

Notes:

**axis** refers to scrolling direction; **cross-axis** refers to the perpendicular.

**cross-axis sizing** distributes cells evenly within the space available according to the formula, for a vertical list:
`cellsPerBand = Math.max(1, Math.floor((viewportDimensions.width - (cradleMarginStart + cradleMarginEnd) + cellGap)/(minWidth + cellGap)))` 
and for a horizontal list the same with `viewportDimensions.height` and `minHeight`,
where 
- `viewportDimensions` is measured by RS3
- `cradleMarginStart`, `cradleMarginEnd` and `cellGap` are taken from the `spacing` property object (see below — but all default to 0)

So a band takes as many cells as fit at their minimum across the axis, and never fewer than one; the cells then share the band evenly, each up to its maximum. Thus for a single column (assuming cellGap = 0), the `minWidth` should be _more than half_ of `viewportWidth - (cradleMarginStart + cradleMarginEnd)`.

A viewport narrower than one cell's `minWidth` still takes one cell per band, and the cradle overflows across the axis (which may be desired). This can cause the cradle to scroll slightly left and right to accommodate the overflow. The host scroller container can be set to fixed dimensions to avoid this cross-axis scrolling if desired.

Setting the minWidth and maxWidth to the same number creates a fixedWidth cell. Setting min to about half of max gives the most reliable distribution fit inside the `viewport` dimensions.

All this may require some experimentation by developers.

If **layout** is set to ‘uniform’, the height of the cell container is set to ‘maxHeight’. If layout is set to ‘variable’, the minHeight and maxHeight styles of the cell container are set to the matching `cellDimensions` values.

**fetchCells** can return fewer cellPacks than specified in the `count` argument. RS3 will keep requesting cells until the required number is met, or until `fetchCells` returns an empty array.

So if you run out of cells to return, return what you have, wait for the next `fetchCells` call, and return an empty array to stop the process. RS3 remembers an empty answer at an end (see **The ends of the data** below), but not as a BOD (beginning of data) or EOD (end of data) flag of its own: the memory goes whenever the end may have changed (a structural call, a reset, a new cradle, a change of the cell standing at that end), at the head when input reaches it, and at the tail when a gesture goes past the end state's mark, so your `fetchCells` function may have to return an empty array frequently.

**Metering the feed.** The `count` RS3 asks for is everything the cradle is short of at that end, which at mount, or after a resize or a reset, can be most of the cradle. A host that wants smaller requests (a paged API, a rate-limited server, a slow source) meters its own feed by returning no more than its own cap from each call. RS3 has no setting for this, because the loop above already does the rest: a short batch is never taken as the end, so RS3 asks again at once, from the cell now at that end of the cradle, until the cradle is full or `fetchCells` returns an empty array. Each batch is rendered as it arrives, so the cradle fills in steps no larger than the cap.

```js
const MAX_PER_FETCH = 20

const fetchCells = async (startCode, referenceID, count) => {
    const limit = Math.min(count, MAX_PER_FETCH)
    return await source.read(startCode, referenceID, limit) // [] only when there is nothing more that way
}
```

Two things to avoid:
- Don't return an empty array to slow the feed down. It ends that fill, and the cradle stays short until RS3 next asks, usually on a scroll.
- Don't return more than `count` to read ahead. The excess is trimmed and reported to the `failed` callback.

### Optional

The following properties are optional, and are designed to support specific use cases.

| property | details |
|:----|:----|
| callbacks:{<br> &nbsp;axisReferenceID,<br> &nbsp;removed,<br> &nbsp;resized,<br> &nbsp;failed,<br> &nbsp;error,<br> &nbsp;warning<br>} | host-provided functions to provide support for data synchronization, and feedback from the scroller. `error` reports what the scroller could not go on with; `warning` reports a value of the host's that the scroller replaced and went on without, and a call whose purpose was already met (a `remove` of an id the cradle does not hold). A fill on an empty cradle is an error: it cannot be met, and the host has to reposition the list with `fetchCradleCells(referenceID)` instead. Each callback is read when the report is made, and one that throws is caught and logged to the console. With no callback for a report, the report goes to the console, named by the scroller: an `error` to `console.error`, a `warning` or a `failed` batch to `console.warn`, as `react-super-simple-scroller (<scrollerName>): <source>: <message>` with the report's object beside it |
| calls:{<br> &nbsp;insert, <br> &nbsp;remove, <br> &nbsp;move <br> &nbsp;replace, <br> &nbsp;dispatchEvent, <br> &nbsp;fetchCradleCells, <br> &nbsp;has, <br> &nbsp;getCradleIDList <br> &nbsp;getCradleSpecs, <br> &nbsp;restoreScrollPositions <br>} | Pass an empty object which will be populated by RS3. RS3 provided functions: 6 operations on the cradle, 3 ways to query the cradle, and `restoreScrollPositions` (see the section on restoring scroll positions below) |
| spacing:{<br> &nbsp;cradleMargin:[start, end]<br> &nbsp;bandPadding:[start, end]<br> &nbsp;cellGap:number <br>} | all integers. cradleMargin is cross-axis spacing at the edges; bandPadding is axis spacing at the start and end of each band; cellGap is cross-axis spacing between cells  |
| operations:{<br> &nbsp;dispatchAttachedEvents,<br> &nbsp;runway,<br> &nbsp;crossAxisChaining,<br> &nbsp;placeholderCap,<br> &nbsp;placeholderSpreadRatio,<br> &nbsp;placeholder,<br> &nbsp;placeholderContext<br>} | when dispatchAttachedEvents is set to `true`, RS3 dispatches events to container components to alert them to the need to restore scroll positions. Default `false`. `runway` is the number of bands out of view, both start and end. Default 4. `crossAxisChaining` set to `false` keeps a gesture across the list's axis from going through to whatever scrolls behind the list. Default `true`. `placeholderCap` is the most placeholder cells the scroller stands ahead of the viewport at each end of the cradle while a fetch is out; `0` turns placeholders off; default a viewport and a half of cells. `placeholderSpreadRatio` (0 to 1) sizes a placeholder between the cell's minimum and maximum on the axis in variable layout; default `null`, which is the minimum. `placeholder` is the host's own placeholder component, and `placeholderContext` is passed to every placeholder untouched. See **Placeholders** below |
|scrollerName: string|for debugging, added to the viewport element as data-scrollername|

Notes about the callbacks (the returned values are found in the arguments of the functions): 

The **axisReferenceID(axisReferenceID, context?)** function returns the current referenceID situated in the first position of the tailblock (right next to the axis) whenever that changes, providing important context to the host. When the cell at the axis is a placeholder (see **Placeholders**), the id is the placeholder's own, and `context` is `{isPlaceholder: true, referenceID, direction}` (the exported `AxisContext` type): the host's row the placeholder stands beside and which side of it. A host that keeps the axis for a restore reads `context?.referenceID ?? axisReferenceID`. A real row at the axis is reported with no `context`.

the **resized(cradlePotential)** function returns the current cradlePotential object, as modified as the result of a user resize operation. See the `getCradleSpecs` call for details of the cradlePotential contents.

The **failed(failedPack)** function returns an object including an array of cellPacks that were trimmed by RS3 for being beyond the requested amount from `fetchCells`. The structure of the returned object is `{source, message, excessList, timestamp}`. Without a `failed` callback the report goes to `console.warn`.

The **removed(removedList)** function returns an array of cell referenceID’s for cells that have been removed by RS3. This could be normal trimming while scrolling, or a cell removed by a call to the remove function.

The **error(errorPack)** function returns an object including information about an error that has occurred. The structure of the returned object is `{source, message, arguments, timestamp}`. The scroller reads the callback each time it reports, and a callback that throws is caught and logged to the console. It is called when a cellPack is rejected (a duplicate or invalid `id`, for instance); when `fetchCells` rejects or returns something other than an array (`source` is `'fetchCells, at'`, `'fetchCells, after'` or `'fetchCells, before'`, `arguments` holds the `startCode`, `referenceID` and `count` that `fetchCells` was called with, and a `return` property holds what came back when it was not an array); when `fetchCradleCells(referenceID)` could not reset the cradle (`source` is `'reset'`; see `fetchCradleCells` below); and when one of the scroller's own cradle operations fails (`source` is `'evaluateIntersections'` or `'cradlePotential'`). None of these stops the scroller. A failed `fetchCells` is treated as an empty batch, and the scroller asks again on the next scroll. Without an `error` callback the report goes to `console.error`.

The **warning(warningPack)** function returns an object including information about a warning that is being issued about an action taken by RS3. The structure of the returned object is `{source, message, arguments, timestamp}`; a replaced value adds `property` and `used` (the value the scroller went on with), the queue's stall adds `waitedMs` and `waiting`, and calls dropped at an unmount add `dropped`. Without a `warning` callback the report goes to `console.warn`.

Notes about the calls:

The following three are mainly intended to be support for drag and drop.

**insert(cellPack, targetReferenceID, position)** `await` return of `true` or `false`. Position must be ‘before’ or ‘after’.

**remove(targetReferenceID)** `await` return of `true` or `false`.

**move(sourceReferenceID, targetReferenceID, position)** `await` return of `true` or `false`. Position must be 'before' or 'after'.

`remove` and `move` refill the cradle before they resolve, and the refill asks `fetchCells` for the cells beyond the cradle's new edges. So the host changes its own data first, and calls them after: `fetchCells` must already answer without the removed cell, or with the moved cell in its new place. A `fetchCells` that still answers from the old data hands back cells the cradle already holds, so the scroller loads nothing from that fetch and reports a duplicate. If the call answers `false`, nothing changed on screen, and the host puts its data back.

The following three are specialized operations.

**replace(referenceID, cellPack)** `await` return of `true` or `false`. Replaces both the referenceID and the component.

**dispatchEvent(referenceID, event)** returns `true` or `false`. The dispatched event must be synthetic (`event = new Event(‘myevent')`).

**fetchCradleCells(referenceID?)** returns a promise of `true`, or of `false` for a reset that could not be done or a fill with nothing to fill from. This re-runs the fetching of cradle cells. Useful to initiate fetch after a change in the underlying data. If no referenceID is passed, uses the current axisReferenceID, and just tries to add cells to the existing cradle. An empty cradle (after a clear, or an `'at'` request that `fetchCells` answered with no row) has nothing to fill from: the call fetches nothing, reports to the `error` callback (`source` is `'fetchCradleCells'`), and resolves `false`. To clear the scroller, pass an empty string as the referenceID. When a referenceID is passed, the cradle is emptied and reset, which can be useful to reposition the cradle after, say, the end user has selected a cell (that may be out of scope) to view, or if the cell sort order has changed. The promise resolves `false`, and the reason is sent to the `error` callback, when the referenceID is invalid, and when the call is made before the scroller has measured its layout; in that second case the referenceID is held, and the scroller opens from it (in place of `seedReferenceID`) as soon as its layout is known. The promise does not reject for either. It resolves `true` when the reset ran, even if `fetchCells` then had nothing to return for that referenceID.

**restoreScrollPositions()** returns a promise of `true` once the viewport has been scrolled to the position the scroller last recorded and, with `operations.dispatchAttachedEvents`, the `rs3attached` events have been dispatched to the cradle's cells. It runs as a queued cradle operation, after whatever operation is in flight, so it never lands in the middle of a band shift or a fill. The same restore runs when an `rs3restore` event is dispatched on the scroller's viewport.

A call must not be awaited from inside `fetchCells`. Every fetch runs inside a queued cradle operation, and the calls are queued operations too, so a `fetchCells` that awaits `insert`, `remove`, `move`, `replace`, `fetchCradleCells` or `restoreScrollPositions` before it returns waits on an operation that is waiting on it, and the list stops. The scroller reports the stall once through the `warning` callback (`source` is `queue`) after 5 s, or to `console.warn` without one. Return the batch first, and make the call afterwards.

The following three are queries of the state of the cradle.

**has(referenceID, out?)** Returns `true` or `false`. A placeholder's id (the scroller's own, in the reserved form `_~_…_~_`) answers `true` while the placeholder stands, and never a report: pass an object as `out` and it is filled with `{isPlaceholder: true, referenceID, direction}`, the host's row the placeholder stands beside and which side of it.

**getCradleIDList()** Returns an array of referenceID’s currently in the cradle, in presentation order. Placeholders are not listed: the list is the host's rows.

**getCradleSpecs** Returns an object with two properties: `{cradlePotential, cradleActual}`.

`cradlePotential` holds the RS3 calculations of the current potential cradle configuration, based on current measurements and scroller properties. It holds the following properties (all properties other than `orientation` and `layout` hold potential counts):

```
{
  cellsPerBand
  backwardBands
  backwardCells
  forwardBands
  forwardCells
  totalBands
  totalCells
  visibleBands
  orientation
  layout
  cellDimensions // as passed to the scroller
  viewDimensions
  spacing // as passed to the scroller
  runway // default 4, or as passed to the scroller
}
```
`cradleActual` holds almost the same properties (with actual counts, but without cellDimensions, viewportDimensions, and spacing), plus the following:

```
{
  axisReferenceID
  firstRealReferenceID // the first of the host's cells in the cradle
  lastRealReferenceID // the last of the host's cells in the cradle
  forwardPlaceholders // placeholders standing after the host's last cell
  backwardPlaceholders // placeholders standing before the host's first cell
  firstPlaceholderReferenceID // the first cell in the cradle, when it is a placeholder; otherwise null
  lastPlaceholderReferenceID // the last cell in the cradle, when it is a placeholder; otherwise null
  quiet // {forward, backward}: the scroller's end marks, read-only. 'end' when the host's last answer at that end
        // returned nothing, 'failed' when it failed, null when the end is open (not answered, or asked again)
  endState // {head, tail}, each {inside, mark, slack, contentEdge}: the end state at that end, read-only (see The
           // ends of the data below)
}
```
The counts (`forwardCells`, `backwardCells`, `totalCells`) are of the host's cells; the placeholders at each end are counted beside them. `quiet` is the memory the scroller itself stops asking on: an end marked `'end'` or `'failed'` is not asked again until a structural call or a reset, a new cradle, or a change of the cell standing there; either end is also asked again when a gesture goes past its end state's mark. `endState` reads the end state at each end, `endState.head` and `endState.tail` (see **The ends of the data** below): `inside` is whether it stands, `mark` is the scroll position at which the viewport's edge at that end rests (its forward edge at the tail, its start at the head), `contentEdge` the scroll position of the cradle's edge at that end, placeholders included, and `slack` the room the mark adds past the rows (`mark` and `contentEdge` are `null` outside the state; `inside` reads `false` while the state's re-ask is out). At rest after an answer with nothing the mark stands `slack` past `contentEdge` (`mark − contentEdge` at the tail, `contentEdge − mark` at the head); it stands further out only where rows have shrunk under a resting viewport.
In a nutshell, RS3 tries to make the actual look like the potential, anchored by the axis.

A call made after the scroller is unmounted does nothing and answers with the empty value of its kind: `insert`, `remove`, `move`, `replace`, `fetchCradleCells` and `restoreScrollPositions` resolve `false`, `getCradleIDList` answers `[]`, `getCradleSpecs` `null`, and every other call `false`. The first such call is reported once through the `warning` callback (`source` is the call's name), or to `console.warn` when no `warning` callback is given; later ones on the same instance are silent. A call still waiting in the queue when the scroller is unmounted is answered in the same way without being run, and is reported under the same once-only warning, which then lists every dropped call's name in `dropped`. The scroller mounts under `React.StrictMode`.

### Technical

The `technical` object property is really only there for experimentation. It contains the following properties:

```
{
  STANDARD_SCROLL_MOMENTUM_FADE // ms, default 700
  SHORT_MOMENTUM_FADE // ms, default 200
  FETCH_CEILING // ms, default 5000
}
```
The STANDARD_SCROLL_MOMENTUM_FADE is the scroll-end debounce's ceiling (a scroll counts as over at the browser's `scrollend` event where the browser sends one, and in any case once this long has passed since its last scroll event) and the time the scroller holds the viewport still when the end state is entered at either end of the data under input (the hold ends at this, and the end state does the rest: see **The ends of the data** below). It is also how recently a scroll event must have arrived for the host's empty or failed answer at an end to count as that scroll's and hold the viewport there: an instant scroll's `scrollend` comes before the answer, so the mode alone would say the scroll was over. A crossing of the cradle's end is never held, whether the block crossed is full or short: a full block is shifted, and a short one asks; only the answer holds.

The SHORT_MOMENTUM_FADE is the resize debounce: the viewport's new size is read this long after the last resize, from the first bootstrapping resizeObserver callback on. It is also how long a gesture past the tail end state's mark is given to fade, from its last scroll event, before the viewport is brought back to the mark.

The FETCH_CEILING is how long a `fetchCells` call may go unanswered before the scroller drops it and asks for the same cells again (see **Placeholders**). A value that is not a positive number is the default.

## Placeholders

A list that outruns its rows shows placeholder cells. When the cradle is short at an end and the host has not yet answered, the scroller stands placeholder cells in the positions it is waiting on, asks `fetchCells` for them, and fills each in place when the answer comes: the row takes the placeholder's position and container, and nothing else in the cradle moves. A fling that outruns the cradle altogether is answered the same way: the cradle is brought to the viewport, with placeholders standing for the rows ahead of it, and the viewport is never scrolled back to the rows it left. That holds whether the outrun is observed as such or as the overflow of a full tail block: only the ends of the data stop the viewport. The list keeps scrolling meanwhile, in both directions, and an end is taken (the end state, the same at the head and at the tail: see **The ends of the data** below) only once the host has answered that there is nothing more, and only with the viewport at that end: an empty answer that comes while the viewport is still bands short of the end marks it and stops nothing, and the end is taken when the viewport arrives there.

Four settings on `operations`:

- **`placeholderCap`** is the most placeholders the scroller stands ahead of the viewport at each end. Placeholders that a fast scroll has carried wholly behind the viewport do not count: they are taken down, a band at a time, before more are placed, so a scroll that outruns the host is met by placeholders and not by an empty viewport. Those that share a band with the host's last (or first) row stay where they stand, uncounted, so an ask's `count` can pass the cap by less than a band. The default is a viewport and a half of cells (`Math.ceil(1.5 × cellsPerBand × visibleBands)`). `0` turns placeholders off: the scroller then waits for each answer inline, with no placeholders standing and nothing held while it waits. The ends of the data are taken as they are with placeholders on: the host's empty answer to `'after'` enters the end state at the tail, and its empty answer to `'before'` enters it at the head. A value that is not a number of 0 or more is reported to `callbacks.error` (`source` is `operations.placeholderCap`) and the default is used; a fraction is floored.
- **`placeholderSpreadRatio`** is a number from `0` to `1` that sizes a placeholder on the axis in variable layout: `min + ratio × (max − min)` of `cellDimensions` (height in a vertical list, width in a horizontal one). The default is `null`, which is `0`: a placeholder stands at the minimum. Uniform layout ignores it. A row that fills a placeholder takes its own size, so with a ratio above `0` the cells past it shift as rows arrive. A value that is not a number from 0 to 1 is reported to `callbacks.error` (`source` is `operations.placeholderSpreadRatio`) and the default is used.
- **`placeholder`** is the host's own placeholder component. Without one the scroller shows its default: a gray *searching…*. The component is given `{context, index, direction, referenceID}`: the host's `placeholderContext`, the placeholder's position in the run at its end counted from the host's rows (the nearest is `0`), the run's direction (`'forward'` or `'backward'`), and the host's row it stands beside. It takes no size of its own: the cell container it stands in carries the cell dimensions, as it does for any cell. A value that is not a component is reported to `callbacks.error` (`source` is `operations.placeholder`) and the default is used.
- **`placeholderContext`** is passed to every placeholder untouched, as `context`. The default placeholder reads `context.text` as its text, and shows none for `''`. **Define it once, or memoize it**: a new object on every render of the host re-renders every placeholder.

How the fetch runs:

- **One fetch out at a time.** The scroller never has two `fetchCells` calls in flight. An ask covers every placeholder standing at its end, and names the host's last (or first) row as `referenceID` with the standing count as `count`: `fetchCells('after', lastRow, n)` or `fetchCells('before', firstRow, n)`. A placeholder's id is never sent as a `referenceID`, and there is no offset to keep: a host that answers each call from the row it names needs no queue of its own. The forward end is asked first. The opening `'at'` ask is made the same way: the seed row and the rows after it stand as placeholders for the cradle's forward room while the host answers.
- **`context`** is the fourth argument, `{attempt, signal}`. `attempt` counts the asks for the same cells, from `1`. `signal` is an `AbortSignal` that fires when the answer is no longer wanted (the ceiling below, a structural call, a reset, the unmount); a host that reads from a network can pass it on, and an answer that arrives after it fired fills nothing.
- **The answer fills by position**, from its first cell, which takes the position nearest the host's rows: an `'after'` answer runs REF+1, REF+2, … and a `'before'` answer REF−1, REF−2, …, as they always have. The positions are those of the run as it stands when the answer arrives, counted from the row the ask named: placeholders the scroll has taken down or stood since the ask went out change which placeholder takes a row, never the order of the rows. A short answer fills the nearest positions and leaves the far ones standing; the next ask covers them. A cell past the end of the standing run takes nothing, and nothing is reported: the scroll has moved past it, and the row is asked for again if the cradle comes back to it. An answer whose ask named a row the run no longer stands on (the run and that row were trimmed away while the ask was out) fills nothing, and the run that stands is asked for from its own row. An empty array is the end of the data at that end: the standing placeholders there are taken down, and a viewport that has reached that end enters the end state there (see **The ends of the data** below). The end is remembered while the cradle and the row at that end are as they were, so an empty answer does not start a loop of placing and asking; a scroll into that end, or a change there, asks again. The end of a run fills the other end too: a cradle still short there, with that end not yet answered, is placed and asked for next, within its cap and the one fetch in flight, so a cradle cut down by the trim during a fast scroll is refilled without waiting for the next input. A cradle short at both ends with both answered is at rest.
- **A failure withdraws the run.** A `fetchCells` that rejects, answers with anything other than an array, or returns an invalid or duplicate cellPack is reported to `callbacks.error` as before, and the placeholders at that end are taken down; a viewport that had scrolled onto them is brought back to the last row, as on an empty answer. The failure is remembered as an empty answer is, so the end is not placed and asked again until a scroll into it, a structural call, or a change of the cell at that end; the memory is the one the end state reads (see **The ends of the data** below), and it does not depend on the scroll position. The other end is filled as after an empty answer. A cellPack that repeats an id within the batch is skipped and reported once, and the rest of the batch fills, as before. An answer beyond `count` is trimmed and reported to `failed`, as before.
- **The ceiling.** A fetch unanswered within `technical.FETCH_CEILING` (5000 ms by default) is dropped: its `signal` fires, a warning goes to `callbacks.warning` (`source` is `fetchCells, at`, `fetchCells, after` or `fetchCells, before`; `attempt` is in the pack), and the same cells are asked for again with `attempt + 1`. That repeats at every ceiling, for as long as the placeholders stand; a late answer to a dropped attempt fills nothing. The opening `'at'` ask stands placeholders and is under the ceiling too, so a host whose every answer takes longer than the ceiling never seeds: set the ceiling above the host's slowest answer.
- **A structural call withdraws every placeholder** and the pending fetch before it runs: `insert`, `remove`, `move`, `replace` and `fetchCradleCells(id)`. The refill after it stands placeholders again. `fetchCradleCells()` with no argument withdraws nothing: it forgets an end the host answered empty at, so the fill asks there again, and keeps every standing placeholder and the ask that is out (while the opening `'at'` ask is still out, before any row has loaded, it keeps that ask and resolves `true`). A reset starts a new generation of placeholder ids.
- **Trimming takes placeholders** as it takes any cell: a run scrolled out of the cradle is removed, and `removed` does not name them. `rs3attached` is not dispatched to them. The trim never takes the real row a standing run is anchored on (the last real row for a forward run, the first for a backward run): the next ask is made from it, and an empty answer leaves the cradle standing on it, so a list scrolled to its end over placeholders settles on its last row rather than emptying. While the axis stands inside a run (a shift onto placeholders not yet answered for), the trim behind it waits for the run's answer: an empty or failed answer brings the viewport back to the anchor, and the rows behind the anchor are what it then shows. The trim is taken when the run answers, with rows, with nothing or with a failure, before the fill that follows the answer; an answer that leaves the axis inside what is left of the run waits again. A resize that shrinks the potential along the axis takes the same trim before its fill, and a structural call (`insert`, `remove`, `move`, `replace`), which takes down every standing run, takes it once its rows have moved and before its fill. So a list at rest with no ask out holds its potential however it came to rest: after a scroll, a resize or a structural call. After a shift on a full cradle the trim behind the axis also keeps the rows a put-back would stand on: a viewport whose forward edge stands past the real rows ahead of the axis is brought back by an empty or failed answer so that the last row ends at its forward edge, and the head bands covering the span it then shows behind the axis stay, bounded by the viewport's own span, so an arrival at the end of the data puts back a head that is not short and asks for nothing more.

What the host sees of a placeholder: its id is the scroller's own, in the reserved form `_~_ph:<generation>:<serial>_~_`, which `fetchCells` may never return (it is refused as any reserved id is). `callbacks.axisReferenceID` names it with a `context` when it is at the axis, `calls.has` answers it with `out`, `getCradleSpecs` counts the runs and names the outermost placeholder at each end, and `getCradleIDList` leaves them out.

## The ends of the data

The scroller has no notion of a top: the host may have rows before the first row it has given as it may have rows after the last, and the room past either is the same. So there is one end state, at whichever end the host has answered with nothing, and the head mirrors the tail in everything below.

**An end is a state.** When the host answers `'after'` (or `'before'`) with nothing while the viewport reaches past the last (first) row, or the viewport arrives there with that answer already given, the scroller enters its end state at that end, once. The state has a *mark*: the scroll position at which the viewport's edge at that end rests, which is the rows' edge plus a small fixed slack in variable layout (none in uniform layout; read it from `endState.tail.slack`). On entry a viewport that is past the mark is snapped to it, and under input it is held for the momentum fade to stop the gesture that brought it there. A list that opens on its first row is not past the head's mark and is not moved: it shows no room before its first row. Inside the state the scroller leaves the viewport alone: the scrollblock is not sized to the content, that end's overflow trigger is not consulted, and the cradle does not follow the viewport past the end. The mark follows the content: it moves outward when the content grows at that end, stays where it is when the content shrinks (the room the viewport had shown is kept), and is reset to the rows' edge whenever the viewport's edge comes back inside it.

A gesture past the mark is not fought while it runs: the wheel is never cancelled and the viewport is never pinned. Once the gesture has faded (`SHORT_MOMENTUM_FADE` from its last scroll event) that end is asked once more, since the gesture into the end is the user asking for more, and the viewport is brought back to the mark with a smooth scroll. With placeholders on, the placeholders standing for that ask are placed first, and while they stand the mark reads past their first band (the row or column of them next to the rows), so the glide ends with them in view. Rows answered fill the placeholders where they stand, the row the user was looking at does not move, and the state is left. An empty answer, or a failed one, takes the placeholders down and stands the state up again, and the mark is the rows' edge plus the slack again: placeholders are in the mark only while they stand, and the room they took is never kept. The viewport is past that mark now, and a second smooth scroll brings it back to it; that one asks nothing, since only a gesture asks, and it waits only for what is left of the quiet window described below: an answer that comes when the list has already been still that long brings the viewport back at once. An answer that lands while the first bring-back is still running turns that bring-back to the mark as it now reads, at once, so with a fast host the two are one glide. The end is read while its ask is out as well: a viewport taken out past the placeholders then, by a second gesture, is brought back onto them when that input has ended, without a further ask, and to the mark when the answer takes them down. So at rest after an answer with nothing the list shows its last (first) row and the slack, and `endState.tail.mark` stands `slack` past `endState.tail.contentEdge` (at the head, before it). Scrolling back into the list does not leave the state by itself: the state goes with the end memory (`quiet.forward`, `quiet.backward`), on a structural call, a reset, a new cradle, or the end row leaving the cradle as the viewport scrolls away from the end.

**The bring-back gives way to the user.** A viewport past a mark is brought back when the gesture that left it there has ended. A wheel, a trackpad and a momentum scroll have no event that says they are over, so a gesture has ended when no input has reached the list for the quiet window: `SHORT_MOMENTUM_FADE`, the same window as above and the only one, counted from the latest of the list's last scroll event, the last wheel event along its axis, the start of a touch on it, and the lifting of the last finger that began on it. A reading the scroller takes by itself (when scrolling ends, when an answer lands, when the last finger lifts, when a bring-back has been stopped) waits only for what is left of that window and then reads the viewport again, so nothing is decided by the wait itself: an answer that lands while scroll events are still arriving moves nothing until they stop, and one that lands after the list has been still for the window brings the viewport back at once. No bring-back is started under a finger: while a finger that began on the list is on the screen nothing brings the viewport back, whichever answer lands, and the viewport is read when the last of them lifts (`touchend` or `touchcancel`). A finger resting elsewhere on the page does not hold the list. A bring-back that is running stops at once, where it is, for a wheel along the list's axis or a new touch. The viewport is read again when that input has ended, and is brought back then if it is still past the mark. Every bring-back takes its turn in the scroller's queue of changes to the list and reads the viewport again as its turn comes, so an ask or an answer ahead of it is applied first. Input that scrolls the list further is a gesture like any other, and one that fades past the mark asks the end once more. A touch that only stops a bring-back may ask the end once more as well: the browser reports where it stopped the scroll with scroll events of its own, and where the end's ask has already been answered these are read as a gesture past the mark. While that ask is still out, nothing more is asked. The scroller's own repositioning of the cradle to the center of the scrollblock, when scrolling stops, is not input: the scroll event that reports it asks nothing, and it stops no bring-back begun since. A scroll made just as scrolling stops, before the scroller has heard a scroll event for it, is not lost in that repositioning: the scroller finds the viewport away from the position it last reported, and reads it there as the gesture it is, so one that fades past the mark asks the end once more.

**A list shorter than its viewport** has both ends in one viewport. The tail's mark is never short of where the viewport rests at the head while the head's state stands, so a gesture toward the tail is brought back to where the list stood, and the two states do not bring the viewport back and forth between them: after one gesture either way the list is still. A gesture toward the head is brought back to the head's mark, which puts the first row `slack` from the viewport's start.

A horizontal list mirrors all of this, left for top and right for bottom. `getCradleSpecs().cradleActual.endState` reads both states.

## Restoring scroll positions

This section is relevant if your cells have scrolling content.

Moving containers around the DOM does not disturb the contained React component states, except for scroll positions. The reason is that when a `container` or its `band` parent are moved with DOM manipulations, the `container` or `band` element tree are momentarily detached from the DOM, before being re-attached in a new location.

Fortunately restoring scroll positions is relatively straightforward.

In brief, 
- enable RS3’s restore-scroll-position support by setting the parameter `operations.dispatchAttachedEvents` to `true`
- maintain the most recent scroll positions of your cell component with a ’scroll’ event listener
- add an event listener in your component for the ‘rs3attached’ event
- in the callback to the ‘rs3attached' listener, restore the scroll positions.

This is all done synchronously and quickly as soon as `MutationObserver` notifies RS3 of an attachment, and therefore is unlikely to interfere with your component's operation.

Also, if your components contain components that use scrolling (like a nested RS3 scroller!), you’ll have to restore scroll positions in those children.

Specifically:

If your component relies on scrolling...

```
const
  outerElementRef = useRef(null), 
  scrollPositionsRef = useRef({x:0, y:0})

useEffect(()=>{

  // track scroll positions
  const scrollCallback = (event) => {
    Object.assign(scrollPositionsRef.current,
      {x:event.target.scrollLeft, y:event.target.scrollTop})
  }

  // restore scroll positions
  const attachedCallback = (event)=>{
    const scrollPositions = scrollPositionsRef.current
    outerElementRef.current.scrollTo(
      scrollPositions.x, scrollPositions.y)
  }

  // set 'scroll' listener
  outerElementRef.current.addEventListener(
    'scroll', scrollCallback)
      
  // set 'rs3attached' listener
  outerElementRef.current.addEventListener(
    'rs3attached', attachedCallback)

  // no return required - RS3 destroys the component container

},[])

return <div ref = {outerElementRef}>
  {cellContent}
</div>
```

If your component _contains_ a component that uses scrolling (here using RS3 as an example) the contained component will have to be notified to restore its scroll positions...

```
  const attachedCallback = (event)=>{
    // restoreScrollPositions is a call available from RS3
    scrollerCallsRef.current.restoreScrollPositions()
  }
```
See the Properties section above for details on obtaining scroller calls, and for setting the `operations` parameter.

## Licence

MIT
