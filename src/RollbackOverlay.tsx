import { Stats } from "./netplayjs/rollbackwrapper";

const RTCStatsReportView = (props: { report: RTCStats }) => {
  return (
    <details>
      <summary>{props.report.type}</summary>
      <div style={{ marginLeft: "10px" }}>
        {Object.entries(props.report).map(([key, value]) => {
          if (key !== "type") {
            return (
              <div key={key}>
                {key}: {value}
              </div>
            );
          }
        })}
      </div>
    </details>
  );
};

export const RollbackOverlay = (props: {
  stats: Stats | null;
  peerPaused: boolean;
  rtcStats: RTCStatsReport | null;
}) => {
  return (
    <>
      {props.peerPaused ? (
        <div className="overlay top left flex-column">
          <p>The other player has minimized or hidden their tab.</p>
          <p>The game may run slowly until they return.</p>
        </div>
      ) : null}
      {props.stats ? (
        <div className="overlay bottom left flex-column">
          <div>Netcode Algorithm: Rollback</div>
          <div>
            Ping: {props.stats.ping.toFixed(2)} ms +/-{" "}
            {props.stats.pingStdDev.toFixed(2)} ms
          </div>
          <div>History Size: {props.stats.historySize}</div>
          <div>Frame Number: {props.stats.frameNumber}</div>
          <div>Largest Future Size: {props.stats.largestFutureSize}</div>
          {props.rtcStats ? (
            <details>
              <summary>WebRTC Stats</summary>
              <div style={{ marginLeft: "10px" }}>
                {[...props.rtcStats.values()].map((report, index) => (
                  <RTCStatsReportView key={report.type + index} report={report} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </>
  );
};
