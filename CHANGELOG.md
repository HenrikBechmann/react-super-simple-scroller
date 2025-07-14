### version 1.1.12 July ?, 2025

- some code maintenance
- minor documentation updates
- add runway property to the `cradleListener` object returned with the `getCradleSpecs` call and the `resized` callback

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