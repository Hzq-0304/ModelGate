import type { ServerProcessStatus } from "../../api";

export type ServerLifecycle = ServerProcessStatus["status"];

export type ServerControlAction = "start" | "stop" | "restart" | "refresh";

