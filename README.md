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

Designed for modern browsers.

The compiled build is ~48KB.

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
  
  const fetchCells = useCallback((direction, referenceID, count)=>{
    const list = []
    if (referenceID >=0 && referenceID <=500) {
      if (direction == 'seed') {
        list.push({
          id = referenceID,
          component = <CellComponent id = {id} />
        })
      } else if (direction == 'forward') {
        let processcount = 0
        for (let id = referenceID + 1;id <= 500; id++) {
          processcount++
          list.push({
            id,
            component: <CellComponent id = {id} />,
          })
          if (processcount === count) break
        }
      } else if (direction == 'backward') {
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
      orientation = 'vertical'
      layout = 'uniform'
      cellDimensions = {cellDimensionsRef.current}
      seedReferenceID = {250}
      fetchCells = {fetchCells}
    />
  </div>
}
```
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

Very few setup parameters are required from the host to get the scroller started. These include: `orientation` (‘vertical’ | ‘horizontal’), `layout` (‘uniform’ | 'variable'), `cellDimensions` (`minWidth`, `maxWidth`, `minHeight`, `maxHeight`), `seedReferenceID` (a string or number), and `fetchCells` (a host-provided function called by the scroller to fetch content for the cradle as needed).

With this information the scroller is able to configure and populate the cradle (and modify the configuration with resizing or parameter updates).

Then, on an ongoing basis, the scroller trims bands from the trailing edge of the cradle as it moves, and adds bands to the leading edge.

In particular, owing to the open-ended scroll allowed by the oversize scrollblock, and to the use of the layout approach, the scroller does not need to know about the scope of the list, nor about “average” cell sizes and such.

See notes about the required parameters, and other available parameters, below.

### Unique cell referenceID's

RS3 requires every component received from the host to be associated with a unique (to the cradle) referenceID — a number or a string. It can be anything from a host array index to a database record's non-compound surrogate key. This is enforced. A cellPack with a duplicate id (or an invalid cellPack) provided to the scroller will cause loading of the current cellPack list to be aborted.

This allows the `fetchCells` function to be straightforward. The parameters of the function are `fetchCells(direction, referenceID, count)`. The `direction` value can be ’seed’, ‘forward’, or 'backward’. The referenceID is the reference from which the returned cells should be selected. The `fetchCells` return value must be an array containing _cellPacks_ of items up to the `count` number (any extra items will be ignored). 

Each cellPack is an object with two properties: `id`, and `component`. The `id` must be unique (to the cradle), and the component value must pass the `React.isValidElement` test.

Returning an empty array signals to the scroller that the beginning or end of data (depending on the direction) has been reached.

Also the scroller assumes the cellPacks in the returned array are in the order in which they should be presented. The cells are added to the cradle in the order received (see `fetchCells` below for details).

The ’seed’ call is a request for the single cellPack (but in an array) indicated in the scroller’s seedReferenceID parameter. Host-returned ‘forward’ items are added to the tailblock, and ‘backward' items are added to the headblock.

### Performance

The scroller waits synchronously for a response from each `fetchCells` call. Therefore if there is much latency in those responses, the performance of the scroller can deteriorate. If your cell content is heavy, or delayed, you might consider returning a light cellFrame component instead, whose job it is to load the substantial content asynchronously. You might even consider using `requestIdleCallback` for that asynchronous load.

Another strategy is to load a light generic placeholder component and then use the scroller’s `replace` call to replace it when the host has obtained the substantial component.

## Properties

Below are the properties that can be passed to RS3.

Note that the object and function properties are tested by RS3 for object identity changes. If a change is detected, then RS3 resets, requesting new cellPacks for all cell id’s around the current axisReferenceID.

Most of the time you will want to avoid this by using `useRef`, `useState` and `useCallback` to store your parameters. On the other hand, if you want to change parameters, make sure that you pass an object with a new identity for the new parameter.

RS3 is responsive to all parameter changes other than `calls`, `callbacks`, and `technical`.

### Required

The following properties are required.

|property|details|
|:-----|:-----|
|orientation: ’vertical’ &vert; ‘horizontal’|the scrolling axis|
|layout: ’uniform’ &vert; ‘variable’|’variable' allows expandability along the scrolling axis|
|cellDimensions: {<br>&nbsp; minWidth, maxWidth,<br>&nbsp; minHeight, maxHeight<br>}|integers, which can be combined to achieve various layout effects|
|seedReferenceID: number &vert; string|the cell referenceID from which RS3 requests initial forward and backward cells|
|fetchCells: Function|parameters: (direction, referenceID, count)|

Notes:

**axis** refers to scrolling direction; **cross-axis** refers to the perpendicular.

**cross-axis sizing** distributes cells evenly within the space available according to the formula:
`cellsPerBand = Math.ceil((viewportDimensions.width - (cradleMarginStart + cradleMarginEnd) + cellGap)/(cellMaxWidth + cellGap))` 
where 
- `viewportDimensions` is measured by RS3
- `cradleMarginStart`, `cradleMarginEnd` and `cellGap` are taken from the `spacing` property object (see below — but all default to 0)

Thus for a single column (assuming cellGap = 0), the `maxWidth` should be slightly _greater than_ `viewportWidth - (cradleMarginStart + cradleMarginEnd)`. To avoid cross-axis overflow the `minWidth` should leave a bit of room to shrink to fit.

Note that the even distribution inside the bounds of the `viewport` can be over-ridden with minWidth. If the minWidth is proportionately large enough, then the distribution is tied to the minWidth value, and may cause a cross-axis overflow (which may be desired). This can cause the cradle to scroll slightly left and right to accommodate the overflow. The host scroller container can be set to fixed dimensions to avoid this cross-axis scrolling if desired.

Setting the minWidth and maxWidth to the same number creates a fixedWidth cell. Setting min to about half of max gives the most reliable distribution fit inside the `viewport` dimensions.

All this may require some experimentation by developers.

If **layout** is set to ‘uniform’, the height of the cell container is set to ‘maxHeight’. If layout is set to ‘variable’, the minHeight and maxHeight styles of the cell container are set to the matching `cellDimensions` values.

**fetchCells** can return fewer cellPacks than specified in the `count` argument. RS3 will keep requesting cells until the required number is met, or until `fetchCells` returns an empty array.

So if you run out of cells to return, return what you have, wait for the next `fetchCells` call, and return an empty array to stop the process. Bear in mind that RS3 does not keep internal BOD (beginning of data) or EOD (end of data) flags, as these conditions may change, so your `fetchCells` function may have to return an empty array frequently.

### Optional

The following properties are optional, and are designed to support specific use cases.

| property | details |
|:----|:----|
| callbacks:{<br> &nbsp;axisReferenceID,<br> &nbsp;removed,<br> &nbsp;failed,<br> &nbsp;error,<br> &nbsp;warning<br>} | host-provided functions to provide support for data synchronization, and feedback from the scroller |
| calls:{<br> &nbsp;insert, <br> &nbsp;remove, <br> &nbsp;move <br> &nbsp;replace, <br> &nbsp;dispatchEvent, <br> &nbsp;fetchCradleCells, <br> &nbsp;has, <br> &nbsp;getCradleIDList <br> &nbsp;getCradleSpecs, <br>} | Pass an empty object which will be populated by RS3. RS3 provided functions: 6 operations on the cradle, and 3 ways to query the cradle |
| spacing:{<br> &nbsp;cradleMargin:[start, end]<br> &nbsp;bandPadding:[start, end]<br> &nbsp;cellGap:number <br>} | all integers. cradleMargin is cross-axis spacing at the edges; bandPadding is axis spacing at the start and end of each band; cellGap is cross-axis spacing between cells  |
| operations:{<br> &nbsp;dispatchAttachedEvents,<br> runway<br>} | when dispatchAttachedEvents is set to `true`, RS3 dispatches events to container components to alert them to the need to restore scroll positions. Default `false`. `runway` is the number of bands out of view, both start and end. Default 4 |
|scrollerName: string|for debugging, added to the viewport element as data-scrollername|

Notes about the callbacks (the returned values are found in the arguments of the functions): 

The **axisReferenceID(axisReferenceID)** function returns the current referenceID situated in the first position of the tailblock (right next to the axis) whenever that changes, providing important context to the host.

The **failed(failedPack)** function returns an object including an array of cellPacks that were trimmed by RS3 for being beyond the requested amount from `fetchCells`. The structure of the returned object is `{source, message, excessList, timestamp}`

The **removed(removedList)** function returns an array of cell referenceID’s for cells that have been removed by RS3. This could be normal trimming while scrolling, or a cell removed by a call to the remove function.

The **error(errorPack)** function returns an object including information about an error that has occurred and resulted in the rejection of a cellPack. The structure of the returned object is `{source, message, arguments, timestamp}`

The **warning(warningPack)** function returns an object including information about a warning that is being issued about an action taken by RS3. The structure of the returned object is `{source, message, arguments, timestamp}`

Notes about the calls:

The following three are mainly intended to be support for drag and drop.

**insert(cellPack, targetReferenceID, position)** `await` return of `true` or `false`. Position must be ‘before’ or ‘after’.

**remove(targetReferenceID)** `await` return of `true` or `false`.

**move(sourceReferenceID, targetReferenceID, position)** `await` return of `true` or `false`. Position must be 'before' or 'after'.

The following three are specialized operations.

**replace(referenceID, cellPack)** `await` return of `true` or `false`. Replaces both the referenceID and the component.

**dispatchEvent(referenceID, event)** returns `true` or `false`. The dispatched event must be synthetic (`event = new Event(‘myevent')`).

**fetchCradleCells(referenceID?)** no return value. This re-runs the fetching of cradle cells. Useful to initiate fetch after a change in the underlying data. If no referenceID is passed, uses the current axisReferenceID, and just tries to add cells to the existing cradle. When a referenceID is passed, the cradle is emptied and reset, which can be useful to reposition the cradle after, say, the end user has selected a cell (that may be out of scope) to view, or if the cell sort order has changed.

The following three are queries of the state of the cradle.

**has(referenceID)** Returns `true` or `false`.

**getCradleIDList()** Returns an array of referenceID’s currently in the cradle, in presentation order.

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
  spacing // as passed to the scroller
}
```
`cradleActual` holds the same properties (but with actual counts), plus the following:

```
{
  axisReferenceID
  firstReferenceID
  lastReferenceID
}
```
In a nutshell, RS3 tries to make the actual look like the potential, anchored by the axis.

### Technical

The `technical` object property is really only there for experimentation. It contains the following properties:

```
{
  STANDARD_SCROLL_MOMENTUM_FADE // ms, default 700
  SHORT_MOMENTUM_FADE // ms, default 200
}
```
The STANDARD_SCROLL_MOMENTUM_FADE is used to suppress scroll momentum when the start or end of data is reached. Also used for resizing debouncing.

The SHORT_MOMENTUM_FADE is used for the first bootstrapping resizeObserver callback.

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
