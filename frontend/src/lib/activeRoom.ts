export const ACTIVE_ROOM_KEY = "albus-active-room";

/**
 * Remember the room that is open so a page reload lands back on it
 * instead of the first room in the list. The room id is mirrored into
 * the query string, so reloading (or sharing) the URL keeps the view.
 */
export function persistActiveRoom(roomId: number | null): void {
  if (typeof window === "undefined") return;
  if (roomId === null) {
    localStorage.removeItem(ACTIVE_ROOM_KEY);
  } else {
    try {
      localStorage.setItem(ACTIVE_ROOM_KEY, String(roomId));
    } catch {
      // storage may be unavailable in private mode
    }
  }

  const url = new URL(window.location.href);
  if (roomId === null) {
    url.searchParams.delete("room");
  } else {
    url.searchParams.set("room", String(roomId));
  }
  window.history.replaceState(null, "", url.toString());
}
