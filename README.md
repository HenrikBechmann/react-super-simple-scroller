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

With more than one cell per band, the rows of the grid are counted from the seed, and the band at either edge of the cradle can hold part of a row. A short first band holds the _end_ of its row: its cells stand in the last slots of the band and the blanks stand before them (to the left, or above in a horizontal list), where the rest of the row arrives: a cell's column is `(index − seed) mod columns` in every full row; a seed row cut short by the end of the list is filled from before the seed first (with three cells per band and a list that ends on its seed, `100 _ _` becomes `_ 96 97` and `98 99 100` as the cells before the seed arrive). A short last band holds the start of its row, with its blanks after its cells. At the head of the data this means that a list seeded part-way through a row shows the blanks of its first row before the first item: with three cells per band and the seed on the second item, the first row reads `_ _ 0` and the next `1 2 3`. A band that is first and last at once fills from its first slot (`0 1 _`). The scroller derives this from where each band stands in the cradle, whenever the bands or their cells change and before the next paint; nothing about the data is consulted and the host has nothing to set.

The cell `container` elements are created by the scroller (with `createElement`) when creating _portals_ (`createPortal(component, container, key`). The portals are rendered to React’s virtual DOM as a single list in a hidden div, which ties the rendered components to the containers. Then the containers are placed, and moved, as needed within the scroller cradle using standard DOM manipulation. Moving the container elements does not disturb the React component states. A browser does reset what has scrolled inside a moved element, and the scroller puts that back (see **Restoring scroll positions** below).

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
- hold-keeper (in the viewport, after the scrollblock, and only while the viewport is held at an end of the data: see **The ends of the data** below)

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

If **layout** is set to ‘uniform’, the height of the cell container is set to ‘maxHeight’. If layout is set to ‘variable’, the minHeight and maxHeight styles of the cell container are set to the matching `cellDimensions` values (minWidth and maxWidth in a horizontal list), and the container is a flex container laid along the list's axis that cuts off what passes it: `display: flex`, `flex-direction: column` in a vertical list and `row` in a horizontal one, and `overflow: hidden`. In it a cell stretches across the axis and takes its own size along it. A cell that scrolls (`overflow: auto` on the cell itself) is held to the container's most and scrolls inside it; a cell that does not is cut off at the container's edge. To fill the container along the axis, give the cell `flex: 1`. A cell placed with `position: absolute; inset: 0` gives its container no size, so in variable layout the container collapses to its least (`minHeight`, or `minWidth` in a horizontal list): let a variable cell stand in the flow. The uniform container carries none of the flex styles.

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
| operations:{<br> &nbsp;restoreCellScroll,<br> &nbsp;dispatchAttachedEvents,<br> &nbsp;runway,<br> &nbsp;crossAxisChaining,<br> &nbsp;placeholderCap,<br> &nbsp;placeholderSpreadRatio,<br> &nbsp;placeholder,<br> &nbsp;placeholderContext,<br> &nbsp;endIndicator,<br> &nbsp;endIndicatorContext,<br> &nbsp;fixedEnds<br>} | `restoreCellScroll` keeps what has scrolled inside a cell where it was when the scroller moves the cell, with no code in the host; `false` turns it off. Default `true`. When `dispatchAttachedEvents` is set to `true`, RS3 dispatches an `rs3attached` event to each cell it has moved, after its own restore, for what the scroller cannot put back itself. Default `false`. See **Restoring scroll positions** below for both. `runway` is the number of bands out of view, both start and end. Default 4. `crossAxisChaining` set to `false` keeps a gesture across the list's axis from going through to whatever scrolls behind the list. Default `true`. `placeholderCap` is the most placeholder cells the scroller stands ahead of the viewport at each end of the cradle while a fetch is out; `0` turns placeholders off; default a viewport and a half of cells. `placeholderSpreadRatio` (0 to 1) sizes a placeholder between the cell's minimum and maximum on the axis in variable layout; default `null`, which is the minimum. `placeholder` is the host's own placeholder component, and `placeholderContext` is passed to every placeholder untouched. `endIndicator` is the host's own component for the indicator shown in the gap a pull opens past an end of the data, and `endIndicatorContext` is passed to it untouched; the default indicator reads its texts from it. `fixedEnds` closes an end of the data: `true` for both, or `{start, end}` with `true` for each end closed. Nothing is looked for past a closed end once the host has answered that there is nothing more there, and a pull past it is a small elastic. Default `false`. See **Placeholders** and **The ends of the data** below |
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

`insert`, `remove`, `move` and `replace` refill the cradle before they resolve, and the refill asks `fetchCells` for the cells beyond the cradle's new edges. So the host changes its own data first, and calls them after: `fetchCells` must already answer with the inserted cell in its place, without the removed cell, with the moved cell in its new place, or with the replacement where the replaced cell was. After a `remove` or a `move`, a `fetchCells` that still answers from the old data hands back cells the cradle already holds, so the scroller loads nothing from that fetch and reports a duplicate. If the call answers `false`, nothing changed on screen, and the host puts its data back.

The following three are specialized operations.

**replace(referenceID, cellPack)** `await` return of `true` or `false`. Replaces both the referenceID and the component.

**dispatchEvent(referenceID, event)** returns `true` or `false`. The dispatched event must be synthetic (`event = new Event(‘myevent')`).

**fetchCradleCells(referenceID?)** returns a promise of `true`, or of `false` for a reset that could not be done or a fill with nothing to fill from. This re-runs the fetching of cradle cells. Useful to initiate fetch after a change in the underlying data. If no referenceID is passed, uses the current axisReferenceID, and just tries to add cells to the existing cradle. An empty cradle (after a clear, or an `'at'` request that `fetchCells` answered with no row) has nothing to fill from: the call fetches nothing, reports to the `error` callback (`source` is `'fetchCradleCells'`), and resolves `false`. To clear the scroller, pass an empty string as the referenceID. When a referenceID is passed, the cradle is emptied and reset, which can be useful to reposition the cradle after, say, the end user has selected a cell (that may be out of scope) to view, or if the cell sort order has changed. The promise resolves `false`, and the reason is sent to the `error` callback, when the referenceID is invalid, and when the call is made before the scroller has measured its layout; in that second case the referenceID is held, and the scroller opens from it (in place of `seedReferenceID`) as soon as its layout is known. The promise does not reject for either. It resolves `true` when the reset ran, even if `fetchCells` then had nothing to return for that referenceID.

**restoreScrollPositions()** returns a promise of `true` once the viewport has been scrolled to the position the scroller last recorded, what has scrolled inside the cradle's cells has been put back (`operations.restoreCellScroll`) and, with `operations.dispatchAttachedEvents`, the `rs3attached` events have been dispatched to the cradle's cells, in that order. It runs as a queued cradle operation, after whatever operation is in flight, so it never lands in the middle of a band shift or a fill. The same restore runs when an `rs3restore` event is dispatched on the scroller's viewport.

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
The counts (`forwardCells`, `backwardCells`, `totalCells`) are of the host's cells; the placeholders at each end are counted beside them. `quiet` is the memory the scroller itself stops asking on: an end marked `'end'` or `'failed'` is not asked again until a structural call or a reset, a new cradle, or a change of the cell standing there; either end is also asked again when a gesture goes past its end state's mark, unless the host has closed that end (`operations.fixedEnds`). `endState` reads the end state at each end, `endState.head` and `endState.tail` (see **The ends of the data** below): `inside` is whether it stands, `mark` is the scroll position at which the viewport's edge at that end rests (its forward edge at the tail, its start at the head), `contentEdge` the scroll position of the cradle's edge at that end, placeholders included, and `slack` the room the mark adds past the rows: at the tail a small fixed room in variable layout and `0` in uniform layout, at the head `0` in either layout (`mark` and `contentEdge` are `null` outside the state; `inside` reads `false` while the state's re-ask is out). At rest after an answer with nothing the tail's mark stands `slack` past its `contentEdge` (`mark − contentEdge`) and the head's mark is its `contentEdge`; a mark stands further out only where rows have shrunk under a resting viewport.
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

A list that outruns its rows shows placeholder cells. When the cradle is short at an end and the host has not yet answered, the scroller stands placeholder cells in the positions it is waiting on, asks `fetchCells` for them, and fills each in place when the answer comes: the row takes the placeholder's position and container, and nothing else in the cradle moves. A fling that outruns the cradle altogether is answered the same way: the cradle is brought to the viewport, with placeholders standing for the rows ahead of it, and the viewport is never scrolled back to the rows it left. That holds whether the outrun is observed as such or as the overflow of a full tail block: only the ends of the data stop the viewport. Each of the scroller's own changes to the cradle (a shift, the overflow of a full tail block, the trim after a resize, `insert`, `remove`, `move`, `replace`) ends, in the same queued operation, by measuring the viewport again: a cradle the scroll has outrun meanwhile is brought to it and the room ahead is stood and asked for, so no operation leaves a run standing wholly behind the viewport for the host's next answer to fill. An operation that only fills starts from the same measure (the host's answer, `fetchCradleCells()` with no argument, the overflow pass at the head): a scroll moves the viewport at once and the scroller's response to it is queued after, so an answer that takes its turn in between brings an outrun cradle to the viewport first and fills its rows there. An end whose state stands is not an outrun cradle: nothing is brought there, and rows that answer at it end the state first. The list keeps scrolling meanwhile, in both directions, and an end is taken (the end state, the same at the head and at the tail: see **The ends of the data** below) only once the host has answered that there is nothing more, and only with the viewport at that end: an empty answer that comes while the viewport is still bands short of the end marks it and stops nothing, and the end is taken when the viewport arrives there. No placeholder is stood at an end whose state stands: the ask that a gesture past such an end sends places nothing, and the end indicator, in the gap that gesture opens, stands in their place (see **The ends of the data** below).

Four settings on `operations` for the placeholders, and two for the end indicator:

- **`placeholderCap`** is the most placeholders the scroller stands ahead of the viewport at each end. Placeholders that a fast scroll has carried wholly behind the viewport do not count: they are taken down, a band at a time, before more are placed, so a scroll that outruns the host is met by placeholders and not by an empty viewport. Those that share a band with the host's last (or first) row stay where they stand, uncounted, so an ask's `count` can pass the cap by less than a band. The default is a viewport and a half of cells (`Math.ceil(1.5 × cellsPerBand × visibleBands)`). `0` turns placeholders off: the scroller then waits for each answer inline, with no placeholders standing and nothing held while it waits. The ends of the data are taken as they are with placeholders on: the host's empty answer to `'after'` enters the end state at the tail, and its empty answer to `'before'` enters it at the head. A value that is not a number of 0 or more is reported to `callbacks.error` (`source` is `operations.placeholderCap`) and the default is used; a fraction is floored.
- **`placeholderSpreadRatio`** is a number from `0` to `1` that sizes a placeholder on the axis in variable layout: `min + ratio × (max − min)` of `cellDimensions` (height in a vertical list, width in a horizontal one). The default is `null`, which is `0`: a placeholder stands at the minimum. Uniform layout ignores it. A row that fills a placeholder takes its own size, so with a ratio above `0` the cells past it shift as rows arrive. A value that is not a number from 0 to 1 is reported to `callbacks.error` (`source` is `operations.placeholderSpreadRatio`) and the default is used.
- **`placeholder`** is the host's own placeholder component. Without one the scroller shows its default: a gray *searching…*. The component is given `{context, index, direction, referenceID}`: the host's `placeholderContext`, the placeholder's position in the run at its end counted from the host's rows (the nearest is `0`), the run's direction (`'forward'` or `'backward'`), and the host's row it stands beside. It takes no size of its own: the cell container it stands in carries the cell dimensions, as it does for any cell. A value that is not a component is reported to `callbacks.error` (`source` is `operations.placeholder`) and the default is used.
- **`placeholderContext`** is passed to every placeholder untouched, as `context`. The default placeholder reads `context.text` as its text, and shows none for `''`. **Define it once, or memoize it**: a new object on every render of the host re-renders every placeholder.
- **`endIndicator`** is the host's own end indicator component: what the scroller shows in the gap a pull opens past an end of the data, where no placeholder is stood (see **The ends of the data** below). Without one the scroller shows its default: a gray *start of list* or *end of list*, *searching…* while the host is being asked there, and nothing after a failed load. The component is given `{context, end, searching, failed, orientation}` (the exported `EndIndicatorProps` type): the host's `endIndicatorContext`, the end of the data it stands at (`'start'` or `'end'`), whether the host is being asked there now, whether the host's last answer there was a failure, and the list's orientation. It is rendered in a slot in the scrolled content, on that end's mark and reaching outward from it (up from the first row of a vertical list and down from the last, left and right in a horizontal one); the slot spans the list across its axis, takes its depth from the component, and takes no pointer events. It is rendered only while a gap is open past the end, so it is never shown at rest and never over a row. A value that is not a component is reported to `callbacks.error` (`source` is `operations.endIndicator`) and the default is used.
- **`endIndicatorContext`** is passed to the end indicator untouched, as `context`. The default indicator reads `context.start`, `context.end`, `context.searching` and `context.failed` as its texts, each replacing its default, and shows nothing for `''`. `context.failed` has no default: the scroller has no words of its own for a failed load, and shows none unless the host gives it some.

How the fetch runs:

- **One fetch out at a time.** The scroller never has two `fetchCells` calls in flight. An ask covers every placeholder standing at its end, and names the host's last (or first) row as `referenceID` with the standing count as `count`: `fetchCells('after', lastRow, n)` or `fetchCells('before', firstRow, n)`. A placeholder's id is never sent as a `referenceID`, and there is no offset to keep: a host that answers each call from the row it names needs no queue of its own. The forward end is asked first. The opening `'at'` ask is made the same way: the seed row and the rows after it stand as placeholders for the cradle's forward room while the host answers. The pending ask is let go when every placeholder it covers has been taken down, as when a scroll away from its end trims them all: its `signal` fires, the end where placeholders stand is asked without waiting for its answer, and that answer, when it comes, fills nothing and is not read (the host may still be answering the call let go when the next one arrives). A run only partly taken down keeps its ask, and the answer fills what remains. The end let go of is asked again, as a new ask with `attempt` `1`, when placeholders stand there again. The opening `'at'` ask is never let go.
- **`context`** is the fourth argument, `{attempt, signal}`. `attempt` counts the asks for the same cells, from `1`. `signal` is an `AbortSignal` that fires when the answer is no longer wanted (the ceiling below, an ask let go as above, a structural call, a reset, the unmount); a host that reads from a network can pass it on, and an answer that arrives after it fired fills nothing.
- **The answer fills by position**, from its first cell, which takes the position nearest the host's rows: an `'after'` answer runs REF+1, REF+2, … and a `'before'` answer REF−1, REF−2, …, as they always have. The positions are those of the run as it stands when the answer arrives, counted from the row the ask named: placeholders the scroll has taken down or stood since the ask went out change which placeholder takes a row, never the order of the rows. A short answer fills the nearest positions and leaves the far ones standing; the next ask covers them. A cell past the end of the standing run takes nothing, and nothing is reported: the scroll has moved past it, and the row is asked for again if the cradle comes back to it. An answer whose ask named a row the run no longer stands on (the run and that row were trimmed away while the ask was out) fills nothing, and the run that stands is asked for from its own row. An empty array is the end of the data at that end: the standing placeholders there are taken down, and a viewport that has reached that end enters the end state there (see **The ends of the data** below). The end is remembered while the cradle and the row at that end are as they were, so an empty answer does not start a loop of placing and asking; a scroll into that end, or a change there, asks again. The end of a run fills the other end too: a cradle still short there, with that end not yet answered, is placed and asked for next, within its cap and the one fetch in flight, so a cradle cut down by the trim during a fast scroll is refilled without waiting for the next input. A cradle short at both ends with both answered is at rest.
- **A failure withdraws the run.** A `fetchCells` that rejects, answers with anything other than an array, or returns an invalid or duplicate cellPack is reported to `callbacks.error` as before, and the placeholders at that end are taken down; a viewport that had scrolled onto them is brought back to the last row, as on an empty answer. The failure is remembered as an empty answer is, so the end is not placed and asked again until a scroll into it, a structural call, or a change of the cell at that end; the memory is the one the end state reads (see **The ends of the data** below), and it does not depend on the scroll position. The other end is filled as after an empty answer. A cellPack that repeats an id within the batch is skipped and reported once, and the rest of the batch fills, as before. An answer beyond `count` is trimmed and reported to `failed`, as before.
- **The ceiling.** A fetch unanswered within `technical.FETCH_CEILING` (5000 ms by default) is dropped: its `signal` fires, a warning goes to `callbacks.warning` (`source` is `fetchCells, at`, `fetchCells, after` or `fetchCells, before`; `attempt` is in the pack), and the same cells are asked for again with `attempt + 1`. That repeats at every ceiling, for as long as the placeholders stand; a late answer to a dropped attempt fills nothing. The opening `'at'` ask stands placeholders and is under the ceiling too, so a host whose every answer takes longer than the ceiling never seeds: set the ceiling above the host's slowest answer.
- **A structural call withdraws every placeholder** and the pending fetch before it runs: `insert`, `remove`, `move`, `replace` and `fetchCradleCells(id)`. The refill after it stands placeholders again. `fetchCradleCells()` with no argument withdraws nothing: it forgets an end the host answered empty at, so the fill asks there again, and keeps every standing placeholder and the ask that is out (while the opening `'at'` ask is still out, before any row has loaded, it keeps that ask and resolves `true`). A reset starts a new generation of placeholder ids.
- **Trimming takes placeholders** as it takes any cell: a run scrolled out of the cradle is removed, and `removed` does not name them. `rs3attached` is not dispatched to them. The trim never takes the real row a standing run is anchored on (the last real row for a forward run, the first for a backward run): the next ask is made from it, and an empty answer leaves the cradle standing on it, so a list scrolled to its end over placeholders settles on its last row rather than emptying. While the axis stands inside a run (a shift onto placeholders not yet answered for), the trim behind it waits for the run's answer: an empty or failed answer brings the viewport back to the anchor, and the rows behind the anchor are what it then shows. The trim is taken when the run answers, with rows, with nothing or with a failure, before the fill that follows the answer; an answer that leaves the axis inside what is left of the run waits again. A resize that shrinks the potential along the axis takes the same trim before its fill, and a structural call (`insert`, `remove`, `move`, `replace`), which takes down every standing run, takes it once its rows have moved and before its fill. So a list at rest with no ask out holds its potential however it came to rest: after a scroll, a resize or a structural call. After a shift on a full cradle the trim behind the axis also keeps the rows a put-back would stand on: a viewport whose forward edge stands past the real rows ahead of the axis is brought back by an empty or failed answer so that the last row ends at its forward edge, and the head bands covering the span it then shows behind the axis stay, bounded by the viewport's own span, so an arrival at the end of the data puts back a head that is not short and asks for nothing more.

What the host sees of a placeholder: its id is the scroller's own, in the reserved form `_~_ph:<generation>:<serial>_~_`, which `fetchCells` may never return (it is refused as any reserved id is). `callbacks.axisReferenceID` names it with a `context` when it is at the axis, `calls.has` answers it with `out`, `getCradleSpecs` counts the runs and names the outermost placeholder at each end, and `getCradleIDList` leaves them out.

## The ends of the data

The scroller has no notion of a top: the host may have rows before the first row it has given as it may have rows after the last, and the room past either is the same. So there is one end state, at whichever end the host has answered with nothing, and the head mirrors the tail in everything below.

**An end is a state.** When the host answers `'after'` (or `'before'`) with nothing while the viewport reaches past the last (first) row, or the viewport arrives there with that answer already given, the scroller enters its end state at that end, once. The state has a *mark*: the scroll position at which the viewport's edge at that end rests, which at the tail is the rows' edge plus a small fixed slack in variable layout (none in uniform layout; read it from `endState.tail.slack`), and at the head is the first row's edge: the head takes no slack in either layout, so a list at rest at its head shows its first row at the viewport's start, with no band of room before it. On entry a viewport that is past the mark is snapped to it, and under input it is held for the momentum fade to stop the gesture that brought it there. A list that opens on its first row is not past the head's mark and is not scrolled: it shows no room before its first row. It opens with the viewport a pixel short of the first row's edge, which keeps the head's triggers before the viewport for as long as rows may still come there; a head that is not closed is left at that rest, and a closed head is rested on the mark itself as its state is entered (see **A pull that starts at a closed end's mark** below). Inside the state the scroller leaves the viewport alone: the scrollblock is not sized to the content, that end's overflow trigger is not consulted, and the cradle does not follow the viewport past the end. The mark follows the content: it moves outward when the content grows at that end, stays where it is when the content shrinks (the room the viewport had shown is kept), and is reset to the rows' edge whenever the viewport's edge comes back inside it.

**The hold on entry, and what scrolls around the list.** The hold that stops the gesture on entry lasts `STANDARD_SCROLL_MOMENTUM_FADE` from its start, or until a wheel away from that end, and the scroller cancels no wheel for it. The same hold is drawn where a scroll arrives at a closed end's mark with the state already standing (see **A scroll that arrives at a closed end's mark is held** below). While it stands the viewport's overflow is `hidden` along the list's axis, which is what stops the browser's own momentum, and what is left of a fling is spent on the list: a scrollable box around the list (a panel, a page) is not moved by a fling that reaches an end of the list's data, at the head or the tail, open or closed, in a vertical or a horizontal list. The host sets nothing for this, on the list or on the box. It rests on the viewport staying a scroll container while it is held. A browser may give the rest of a gesture to the nearest scrollable box around an element that can no longer scroll at all, whatever `overscroll-behavior` says (Safari does: WebKit bug 243452), and an open axis with nothing to scroll counts for no more than a closed one. So the hold closes the list's axis only and leaves the other `auto`, and for its life the scroller puts one element of its own in the viewport, after the scrollblock: `data-type="hold-keeper"`, absolutely positioned, not visible, taking no pointer events, 1 px along the axis, and reaching 1 px past the viewport on each side across it. That 1 px of range is what keeps the gesture the list's. It is not shown: a held viewport is put back along the list's axis wherever a scroll event finds it moved, and across it too where the list has no room across of its own, and the viewport draws no scrollbar (`scrollbar-width: none`). A list that is wider than its viewport (taller, in a horizontal list) has a range across without the keeper, and keeps the use of it: its cross axis stays the gesture's while a hold stands, and only the list's axis is put back. Which of the two a hold is, is read once from the layout as the hold opens (the viewport's scroll size across against its client size, before the keeper is in), and stands until the release. At the release the viewport's overflow is `auto` on both axes again and the element is removed. For a host this means that the viewport has a second child for the life of a hold (the scrollblock stays the first), that the viewport's own `overflow` style then reads `hidden` on the list's axis only, and that a gesture across the list which begins while a hold stands, toward the side that 1 px lies on (to the right over a vertical list, downward over a horizontal one, in a left-to-right box), is taken by the viewport and does not reach what scrolls behind the list (`operations.crossAxisChaining`). One toward the other side goes through, and so does any gesture begun after the release. In a list with room across of its own, a gesture across scrolls the list while a hold stands as it does without one.

A gesture past the mark is not fought while it runs: the viewport is never pinned, and the wheel is never cancelled except by a closed end, which takes a pull that starts at its mark (see **A closed end** below). Once the gesture has faded (`SHORT_MOMENTUM_FADE` from its last scroll event) that end is asked once more, since the gesture into the end is the user asking for more, and the viewport is brought back to the mark with a smooth scroll, begun as the ask is sent: a host slow to answer does not keep the viewport out past the end. Nothing is placed at the end for that ask, with placeholders on or off, so the mark is the rows' edge (plus the tail's slack) throughout, and the end indicator in the gap reads *searching…* while the ask is out and the viewport is still past the mark (see **The end indicator** below). Rows answered are added at the end, the rows already standing do not move, and the state is left; a bring-back still waiting or running then stops where it is, since its mark no longer applies, so the viewport is never taken over the new rows. An empty answer, or a failed one, stands the state up again on the mark it kept. A viewport that answer finds past the mark is brought back by a smooth scroll that asks nothing, since only a gesture asks, and it waits only for what is left of the quiet window described below: an answer that comes when the list has already been still that long brings the viewport back at once. The end is read while its ask is out as well: a viewport taken out past the mark then, by a second gesture, is brought back to it when that input has ended, without a further ask. So at rest after an answer with nothing the list shows its last row and the slack, or its first row at the viewport's start, and `endState.tail.mark` stands `slack` past `endState.tail.contentEdge` (`endState.head.mark` is `endState.head.contentEdge`). Scrolling back into the list does not leave the state by itself: the state goes with the end memory (`quiet.forward`, `quiet.backward`), on a structural call, a reset, a new cradle, or the end row leaving the cradle as the viewport scrolls away from the end.

**The bring-back gives way to the user.** A viewport past a mark is brought back when the gesture that left it there has ended. A wheel, a trackpad and a momentum scroll have no event that says they are over, so a gesture has ended when no input has reached the list for the quiet window: `SHORT_MOMENTUM_FADE`, the same window as above and the only one, counted from the latest of the list's last scroll event, the last wheel event along its axis, the start of a touch on it, and the lifting of the last finger that began on it. A reading the scroller takes by itself (when scrolling ends, when an answer lands, when the last finger lifts, when a bring-back has been stopped) waits only for what is left of that window and then reads the viewport again, so nothing is decided by the wait itself: an answer that lands while scroll events are still arriving moves nothing until they stop, and one that lands after the list has been still for the window brings the viewport back at once. No bring-back is started under a finger: while a finger that began on the list is on the screen nothing brings the viewport back, whichever answer lands, and the viewport is read when the last of them lifts (`touchend` or `touchcancel`). A finger resting elsewhere on the page does not hold the list. A bring-back that is running stops at once, where it is, for a wheel along the list's axis or a new touch. The viewport is read again when that input has ended, and is brought back then if it is still past the mark. Every bring-back takes its turn in the scroller's queue of changes to the list and reads the viewport again as its turn comes, so an ask or an answer ahead of it is applied first. Input that scrolls the list further is a gesture like any other, and one that fades past the mark asks the end once more. A touch that only stops a bring-back may ask the end once more as well: the browser reports where it stopped the scroll with scroll events of its own, and where the end's ask has already been answered these are read as a gesture past the mark. While that ask is still out, nothing more is asked. The scroller's own repositioning of the cradle to the center of the scrollblock, when scrolling stops, is not input: the scroll event that reports it asks nothing, and it stops no bring-back begun since. A scroll made just as scrolling stops, before the scroller has heard a scroll event for it, is not lost in that repositioning: the scroller finds the viewport away from the position it last reported, and reads it there as the gesture it is, so one that fades past the mark asks the end once more.

**The end indicator.** No placeholder is stood at an end whose state stands. While a gap is open past such an end's mark, an indicator is shown in that gap instead. It stands in the scrolled content, on the mark and reaching outward from it: above the first row and below the last (and the tail's slack) in a vertical list, to their left and right in a horizontal one. So it moves with the rows, is never over one, and is out of sight whenever the list is at rest, whatever it reads; it takes no pointer events. A gap is open while the viewport's edge is past the mark and, at a closed end (below), while the rows are still sliding back to it. The indicator's text follows the state. Inside the state it is the end word, *start of list* or *end of list*: that is what a pull past the end shows while it runs. From the moment the gesture's ask is sent until its answer it is *searching…*. After an empty answer it is the end word again, for as long as the gap is still open. After a failed answer it is the `failed` state, for which the default indicator shows nothing: what went wrong, and what to say of it, is the host's to know, and a host gives it words with `endIndicatorContext.failed` or with its own component, which is given `failed`. It is shown and hidden by the state's transitions and the readings of the viewport, never by a timer: it goes when the viewport's edge is back at the mark (at a closed end, when the slide back has finished), and when rows arrive. The bring-back starts as the ask is sent, so with a host slow to answer *searching…* is read only while the viewport glides back, and the rows answered later are added at the end of a list already at rest; under a finger held past the end nothing brings the viewport back, and the indicator reads *searching…* until the answer and the end word after it. An end that another fill is asking (the refill after a structural call, which stands its placeholders) shows no indicator, and a closed end never reads *searching…*. The component and its texts are the host's to change: `operations.endIndicator` and `operations.endIndicatorContext` (see **Placeholders** above).

**A closed end.** `operations.fixedEnds` is the host's word that nothing is to be looked for past an end: `true` closes both ends, `{start: true}` the head, `{end: true}` the tail, and the default `false` neither. It does not say that the data cannot change, and it gives the scroller no length: a closed end is found as any end is, by the host's empty answer there, and structural calls and resets work as they do anywhere. What it changes is what happens once that end's state stands. A gesture past a closed end's mark asks nothing and places nothing, and the pull past it is a small elastic: the rows are drawn only part of the pull's travel past their rest, `cap × travel / (travel + cap)`, where `cap` is the smaller of 60 px and a tenth of the viewport along the axis. So the pull starts one for one with the hand, grows more slowly the further it goes, and never reaches the cap; travel back toward the mark is drawn one for one. The axis's transform draws it, and the end indicator reads the end word while the rows are drawn past their rest. The value is read each time it is used. One that is neither a boolean nor an object is reported to `callbacks.error` (`source` is `operations.fixedEnds`) and neither end is closed. The browser's own overscroll bounce is not involved: the cradle stands near the middle of a scrollblock far longer than any gesture, so an end of the data is never at the scrollblock's own boundary, and the scroller's elastic is the only one.

**A scroll that arrives at a closed end's mark is held.** A pull begins at rest on the mark. A scroll that reaches the mark any other way while that end's state stands arrives there, as a scroll arrives at an end on entry: a fling or a drag that began inside the list, a pixel or more short of the mark (after the list was scrolled back from its end, or after a resize left the viewport short of it), and a scroll that is still under way when it gets there. None of its events can be taken as a pull, since a browser lets a touch's moves, and a wheel gesture's events, be cancelled only where the first of them was; and a stretch drawn in the scroll events of a momentum is a frame behind a scroll the browser has already shown, so the last rows would shake against the gap for as long as the momentum ran. So at the first scroll event that finds the viewport past the mark the rows are put on the mark under the viewport, at once and with no scroll (the axis moves, and the scroll position stays where the browser left it, as after the return below), and the list is held as on entry (**The hold on entry** above): what is left of the momentum is stopped, no stretch is drawn for it and no slide follows it, and the list rests on its mark. The hold is the same one, drawn whether or not a finger is on the list, and it is drawn again by a scroll that arrives after its release. A pull the browser makes from rest on the mark (one the scroller could not take, below) is still drawn as a stretch, for as long as that stretch stands, and so is a scroll that begins on the mark of an end that is not closed: only a closed end has an arrival.

**A pull that starts at a closed end's mark is the scroller's.** With the list at rest on the mark, a wheel or a finger's move outward is taken before the browser scrolls for it: the event is cancelled (`preventDefault`), the transform alone draws the stretch, and the scroll position does not move. Left to the browser, the scroll comes first and the scroller can only follow it, a frame behind. An input is taken only where the browser lets it be cancelled, where it goes outward along the list's axis (and, as it starts, no further across the list than along it), where a wheel is measured in pixels, and where nothing between its target and the viewport can scroll that way instead: a scrolling area inside a row keeps its own input. An input that arrives while the scroller is changing the list, or holding it, is left to the browser as well: the list is never made to wait for a pull. While a stretch stands every input the browser lets be cancelled is the scroller's, whichever way it goes; one that goes back past the mark is left to the browser, which scrolls on into the list from where the rows are. A pull from rest on the mark that the scroller could not take (an input the browser does not let be cancelled, a key, a scrollbar) is the browser's: the scroll position travels as the browser scrolls it, and the scroller draws the stretch in the scroll event, behind it. A scroll that reaches the mark in the course of a scroll (a drag or a fling that began inside the list) is not a pull: it arrives, and is held (above). A closed head rests on its mark from the moment its state stands, so the first pull after a mount is taken as every later one is. The list opens a pixel short of its first row (**An end is a state** above), and a pull is taken from the mark and from no pixel short of it; so as a closed head's state is entered with the viewport at that rest, the rows are put on the mark under the viewport, by the transform and with no scroll, as an arrival puts them: the content moves by that pixel, once. A viewport that stands further from the mark has been scrolled there and is left where it is, and a scroll from there arrives. The tail has no such pixel. For a pull to be taken at all, the viewport's `wheel` and `touchmove` listeners are not passive, and they stand for the list's whole life, whichever ends are closed: whether a touch's moves can be cancelled is settled as the touch starts, before the list is known to reach a closed end under it. Nothing is cancelled anywhere but at a closed end's mark or in its stretch.

**The return at a closed end is the transform's as well.** When the gesture has ended (the quiet window above), the rows are brought back to the mark without a scroll, however the pull was drawn: the axis is put where the rows stand on the mark, at once, and a short slide, drawn by the browser, shows them travel there from where they were. The scroll position stays where it was; what a gesture ran up past the mark is put back when scrolling stops, in the scroller's own repositioning of the cradle, where the axis and the scroll position move together and nothing moves on screen. The indicator stands until the slide has finished. The slide gives way to input at once, in either direction: on the wheel or the touch itself it is ended where it has reached, with the rows left exactly where they were drawn. A pull outward goes on from there; a pull back uses up what is left of the stretch, and the browser scrolls the list from there. Under a held finger nothing is brought back until it lifts.

**A list shorter than its viewport** has both ends in one viewport. The tail's mark is never short of where the viewport rests at the head while the head's state stands, so a gesture toward the tail is brought back to where the list stood, and the two states do not bring the viewport back and forth between them: after one gesture either way the list is still. A gesture toward the head is brought back to the head's mark, which puts the first row at the viewport's start: the head takes no slack. With both ends closed the viewport's rest at the head is the head's mark itself, so the list rests on both marks at once, and a pull is taken at either end.

**After a resize of the viewport.** A resize holds the cell at the axis where it is, at or near the viewport's start, and the rows are laid out again around it. No scroll follows a resize, so the scroller reads where it left the viewport against each end whose state stands, as the resize's own operation ends, after its layout and its fill. Where the resize changed the cells per band the rows at each end are other rows, and each end's mark is entered again from their edge (plus the tail's slack): it is never the mark kept from before the resize. A viewport the resize left past a mark is brought back to it as after a gesture: by a smooth scroll at an open end and the slide at a closed one, after what is left of the quiet window, and never under a finger. A list that now fits its viewport comes to rest at its head, by the paragraph above; where the head is being asked as the resize ends, the reading of the tail waits for the host's answer there, so the list moves once. A viewport the resize leaves short of an end is not moved: a list at rest at its tail that is made narrower, and so has more rows, rests on the row the resize held, with its tail further on. The host has nothing to set and scrolls nothing itself.

A horizontal list mirrors all of this, left for top and right for bottom. `getCradleSpecs().cradleActual.endState` reads both states.

## Restoring scroll positions

This section is relevant if your cells have scrolling content.

A browser resets the scroll position of an element, and of every element inside it, when the element is moved in the DOM. RS3 moves cell containers, and the bands that hold them, whenever the axis shifts and whenever the cells are divided into bands again (a resize that changes the number of cells per band). React's state in a cell is untouched by the move. What has scrolled inside the cell would be back at 0.

**By default nothing is needed.** RS3 keeps the scroll position of every element that scrolls inside a cell, at any depth and on both axes, and puts it back as the cell's container lands, before the browser paints. A scroller nested in a cell, wrapped in other elements or not, is restored too: it is told to restore itself, since its position is its own to keep. A cell component needs no listener and no ref for any of this.

What runs for it: one passive `scroll` listener on the viewport, in the capture phase, hears the scrolls inside the scroller's cells and keeps each element's `scrollTop` and `scrollLeft`. It returns at once for the list's own scroll and for a scroll inside a nested scroller's cells (those are the nested scroller's to keep), and it reads and writes nothing of the list's own scrolling. A placeholder is not recorded, so the row that takes a placeholder's container starts at 0. `operations.restoreCellScroll: false` turns the listener and the restore off; a value that is not a boolean is reported to `callbacks.error` (`source` is `operations.restoreCellScroll`) and the default is used.

### What the scroller cannot see

RS3 puts back only what it heard scroll, on the element that scrolled. For the rest, set `operations.dispatchAttachedEvents` to `true`: RS3 then dispatches an `rs3attached` event to the first child of each cell container it has moved, after its own restore, so a listener there finds the cell's own scrolling already back. The cases:

- **Shadow DOM.** A scroll inside a shadow root is not heard outside it, so an element that scrolls in a shadow tree is not recorded.
- **An iframe.** Its document is not the scroller's: its scrolls are not heard, and a browser loads an iframe again when it is moved.
- **State the host keeps elsewhere.** A position held in the host's own state, and anything other than `scrollTop` and `scrollLeft` that the move disturbs, is the host's to put back.
- **An element React rebuilds.** A position is kept against the element that scrolled. Where the host renders a new element in its place (a changed `key`, the other branch of a condition), the new element has no position kept and starts at 0.

The listener goes on the cell component's outermost element, which is the container's first child:

```
const outerElementRef = useRef(null)

useEffect(()=>{

  // put back what RS3 could not see
  const attachedCallback = ()=>{
    restoreWhatTheHostKeeps()
  }

  outerElementRef.current.addEventListener(
    'rs3attached', attachedCallback)

  // no return required - RS3 destroys the component container

},[])

return <div ref = {outerElementRef}>
  {cellContent}
</div>
```

`calls.restoreScrollPositions()`, and an `rs3restore` event dispatched on the scroller's viewport, run the same restore for every cell in the cradle: the list's own position, then the cells' scrolling, then `rs3attached` where it is asked for. A host uses them when it moves the scroller itself (the element the scroller stands in is moved in the DOM).

### A scrolling cell with a border

A recipe for the host's cells in variable layout, not something the scroller does. The cell container cuts off what passes it, so where a border stands decides whether its far edge is seen.

A border alone goes on the scrolling cell itself:

```
const cellStyles = {
  border: '1px solid gray',
  overflow: 'auto',
}
```

The cell is held to the container's most, its border stands inside the container, and its content scrolls inside the border.

A border around a fixed header or footer needs a scrolling element inside the cell. The cell is a flex column held to the container, and the element between the header and the footer scrolls:

```
const cellStyles = {
  border: '1px solid gray',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  flex: 1, // to fill the container; leave it out for a cell as tall as its content
}

const bodyStyles = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
}

return <div style = {cellStyles}>
  <header>{title}</header>
  <div style = {bodyStyles}>{content}</div>
  <footer>{actions}</footer>
</div>
```

What holds the cell to the container is the cell's own `minHeight: 0`. A flex item is never smaller than its content unless it says so: without it the cell stands as tall as its content, however little the container allows, the container cuts off the cell's bottom border and its footer, and the body does not scroll.

## Licence

MIT
