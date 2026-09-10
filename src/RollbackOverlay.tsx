import { Stats } from "./netplayjs/rollbackwrapper";

export const RollbackOverlay = ({ stats }: { stats: Stats | null }) => stats && (
  <div className="network-stats flex-column">
    <div>History Size: {stats.historySize}</div>
    <div>Frame Number: {stats.frameNumber}</div>
    <div>Largest Future Size: {stats.largestFutureSize}</div>
  </div>
);
