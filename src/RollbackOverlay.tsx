import { Stats } from "./netplayjs/rollbackwrapper";

export const RollbackOverlay = ({ stats, peerPaused }: {
  stats: Stats | null;
  peerPaused: boolean;
}) => (
  <>
    {peerPaused && (
      <div className="overlay top left flex-column">
        <p>A player has minimized or hidden their tab.</p>
        <p>The game may run slowly until they return.</p>
      </div>
    )}
    {stats && (
      <div className="overlay bottom left flex-column">
        <div>History Size: {stats.historySize}</div>
        <div>Frame Number: {stats.frameNumber}</div>
        <div>Largest Future Size: {stats.largestFutureSize}</div>
      </div>
    )}
  </>
);
