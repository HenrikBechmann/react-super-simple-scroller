declare const useRemoveCells: ({ portalIDListRef, cellPortalListRef, cellDataListRef, portalContainerMapRef, headBandListRef, tailBandListRef, leadHeadblockBandRef, leadTailblockBandRef, cradleActualRef, placeholdersRef, callbacksRef, }: {
    portalIDListRef: any;
    cellPortalListRef: any;
    cellDataListRef: any;
    portalContainerMapRef: any;
    headBandListRef: any;
    tailBandListRef: any;
    leadHeadblockBandRef: any;
    leadTailblockBandRef: any;
    cradleActualRef: any;
    placeholdersRef: any;
    callbacksRef: any;
}) => ({ backwardCellsToRemoveCount, forwardCellsToRemoveCount, }: {
    backwardCellsToRemoveCount: any;
    forwardCellsToRemoveCount: any;
}) => void;
export default useRemoveCells;
