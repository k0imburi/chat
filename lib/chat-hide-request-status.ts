type HideRequestState = {
  status: string;
  action: string;
};

export function chatHideRequestMessageText(
  messageText: string | null,
  request: HideRequestState,
) {
  const status = request.status === "ACCEPTED"
    ? "ACCEPTED"
    : request.status === "DECLINED"
      ? "DECLINED"
      : request.status === "EXPIRED"
        ? messageText?.endsWith(":WITHDRAWN") ? "WITHDRAWN" : "EXPIRED"
        : "PENDING";
  const action = request.action === "UNHIDE_FOR_ALL" ? "UNHIDE" : "HIDE";
  return `CHAT_${action}_REQUEST:${status}`;
}
