### version 2.0.0 (unreleased)

#### Breaking

- `seedReferenceID` is the mount-time seed only. A change to the prop after mount no longer resets the list, and a new `fetchCells` identity no longer resets it either (the latest `fetchCells` is still the one every fetch calls). A host repositions the list with `calls.fetchCradleCells(id)` and clears it with `calls.fetchCradleCells('')`, as before; those are now the only ways to do either after mount, so one host action is one reset. Previously a prop-driven reset queued behind the host's own `fetchCradleCells` and overrode it, which left the list at the prop's row rather than the host's. A list cleared with `fetchCradleCells('')` now stays empty through a resize until the host seeds it again (it used to be re-seeded at the prop), and a list mounted with `seedReferenceID` null and seeded by `fetchCradleCells` is now reconfigured on a resize like any other (it used to be skipped)

#### Changes

- Behaviour change: a gesture across the list's axis now goes through to whatever scrolls behind the list (`overscroll-behavior: auto` on that axis), so a vertical list inside a horizontally scrolling container, or a horizontal list inside a vertically scrolling page, no longer swallows it; the axis the list scrolls along stays contained (`none`) as before. New `operations.crossAxisChaining?: boolean` (default `true`); `false` turns it off for one scroller, which keeps the list scrolling itself on that axis when its cells are wider than its frame and only stops the gesture going on from the list's edge. Consequence: a pull down over a horizontal list now reaches the page, so on a browser with pull-to-refresh it starts one when the page is at its top, unless the host blocks it at the root (`overscroll-behavior-y: none` on `html` / `body`); likewise a sideways swipe over a vertical list can start the browser's back/forward swipe as it does over any other element, unless the host sets `overscroll-behavior-x` at the root. A host that wants neither and cannot touch its root passes `false`
- Behaviour change: a `fetchCells` that rejects, or that resolves with anything other than an array, no longer stops the scroller. The failure goes to `callbacks.error` (`source` is `fetchCells, seed`, `fetchCells, forward` or `fetchCells, backward`; `arguments` holds the `direction`, `referenceID` and `count` the host was called with; `return` holds what came back when it was not an array) and is read as an empty batch, so that pass ends there and the next scroll asks again. Previously the failure escaped as an unhandled promise rejection with the observers left disconnected, and the list never fetched again. An empty array is still the end of the data and reports nothing
- Behaviour change: `calls.fetchCradleCells` now resolves a boolean (it resolved `undefined`): `true` when the cradle was reset, cleared (`''`) or filled as asked, and `false` for a reset that returned early (an invalid `referenceID`, or a call made before the scroller has measured its layout). A reset asked for before layout used to seed nothing and say nothing, and the list then opened on the mount-time seed; it now reports to `callbacks.error` (`source: 'reset'`, the message names the early return), and the `referenceID` is held and seeded from as soon as layout is known, in place of `seedReferenceID`. The promise resolves `false` rather than rejecting, so that a host call written without a `catch` does not become an unhandled rejection
- Bug fix: an error thrown inside a queued cradle operation (a scroll shift, an overflow trim, `insert`, `remove`, `move`, `replace`, a fill, a reset, a resize) can no longer leave the IntersectionObservers disconnected; the reconnection is in a `finally`. Where the scroller itself discards the operation's promise (the work a scroll starts, and the layout effect) the error is reported to `callbacks.error`, with `source` `evaluateIntersections` or `cradlePotential`, instead of escaping as an unhandled rejection
- Bug fix: a forward trigger crossing with no tail bands in the cradle returned with the observers disconnected; they are now disconnected only after that guard
- Bug fix: a fetch still in flight when the scroller is unmounted or reset no longer writes into a cradle that is gone (the forward and backward fetches re-check after their `await`, as the seed fetch did); an unmount mid-fetch used to throw `Cannot read properties of null (reading 'append')` as an unhandled rejection
- Bug fix: when the seed fetch returns nothing, no `fetchCells('forward', undefined, n)` or `fetchCells('backward', undefined, n)` follows it; the cradle stays empty until the host seeds it
- Bug fix: a trackpad fling into an end of the data put the list back two or three times, because the hold on scrolling was released while the fling's wheel events were still arriving; the hold at an end of the data now lasts until the wheel has been quiet for 300 ms (and never less than `STANDARD_SCROLL_MOMENTUM_FADE`), and a wheel away from that end releases it at once. The wait for quiet also ends once the host's `fetchCradleCells` has reset the list or brought cells to that end. A hold anywhere else in the data, and one that follows a position recovery, is released after `STANDARD_SCROLL_MOMENTUM_FADE` as before
- Bug fix: Safari passes the wheel over a held (`overflow:hidden`) list to a scrollable ancestor in spite of `overscroll-behavior`, so a fling into an end of the data scrolled what is behind the list; a wheel along the list's axis is now cancelled while the list is held, wherever the browser allows it (a wheel mostly across the list, and a pinch zoom, are left alone). The `wheel` listener is non-passive and is attached only for the life of a hold
- Bug fix: a scroll back out of an end of the data, begun while the list was held, moved the ancestor instead of the list in Safari and waited more than a second in Firefox, and in Safari what was left of a fling when any hold let go moved the ancestor too; in every hold the list is now made scrollable again as soon as a wheel has been cancelled, and the cancelled wheel is what holds it. Where the wheel cannot be cancelled (a fling in Chrome and Edge) or none arrives (touch, keyboard, scrollbar) the list stays hidden for the hold, as before. Known limit: a wheel that Safari will not let be cancelled can still go to the ancestor while the list is hidden (WebKit bug 243452); measured in Safari 27, that moved the ancestor in 2 of 72 holds

### version 1.1.12 Sept ?, 2025

- some code maintenance
- minor documentation updates
- add runway property to the `cradleListener` object returned with the `getCradleSpecs` call and the `resized` callback
- report initial axisReferenceID (the seedReferenceID) with axisReferenceID callback
- valid seedReferenceID cannot be an empty string
- pass an empty string for referenceID to `fetchCradleCells` call to clear the scroller 
- Bug fix: Safari multiplies IntersectionObserver `rootBounds` by the page zoom when the root is an element, so at any zoom other than 100% the scroller lost its position or snapped back; the viewport's `getBoundingClientRect()` is read instead
- Bug fix: a fast fling can carry a trigger across the whole viewport without an intersection report, stranding the cradle out of view (all browsers); triggers are now reconciled from live geometry in the observer callback, once a frame while scrolling, and at scroll end

### version 1.1.11 July 13, 2025

- somewhat graceful exit from `cellsPerBand` == 0 error (ErrorBoundary)

### version 1.1.10 July 13, 2025

- Bug fix: use default objects for object parms with persistent identities
- throw error when cellsPerBand calculates to 0

### version 1.1.9 July 10, 2025

provided defaults for 
- orientation: ‘vertical'
- layout: ‘uniform'
- callbacks, spacing and operations:{} (obviating the need for the optional chaining operator - '?') 

### version 1.1.8 July 8, 2025

- Bug fix -- added ‘?’: `if (callbacksRef.current?.resized)`

### version 1.1.7 July 8, 2025

- added callback `resized`
- added `viewportDimensions` to cradlePotential returned by the `getCradleSpecs` call and the `resized` callback

### version 1.1.6 July 7, 2025

- fix bug in `move` call
- tweak `assertIntersectionsConnect` calls

### version 1.1.5 July 7, 2025

- remove debug code

### version 1.1.4 July 6, 2025

- tweaked the formula for `cellsPerBand`

### version 1.1.3 July 6, 2025

- removed `overflow:hidden` from container styles to allow cell components to bleed content outside of the container.
- tweaked the formula for `cellsPerBand`

### version 1.1.2 July 5, 2025

- included brief demo video in README

### version 1.1.1 July 4, 2025

- only the last mutation item in the DOMManipulationQueue reconnects the IntersectionObserver

### version 1.1.0 July 4, 2025

- queued mutation cycles
- replace now requires await for response
- added dispatchEvent(referenceID, event)

### Version 1.0.2 July 1, 2025

First release