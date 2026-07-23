export interface UserPermissions {
  view: string[];
  move: string[];
  flags: string[];
}

export function parseUserPermissions(allowedStatusesStr: string | null | undefined, allStatusIds: string[]): UserPermissions {
  if (!allowedStatusesStr) {
    return {
      view: allStatusIds,
      move: allStatusIds,
      flags: []
    };
  }

  try {
    const parsed = JSON.parse(allowedStatusesStr);
    
    // Check if it's the new format (JSON object)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        view: Array.isArray(parsed.view) ? parsed.view : allStatusIds,
        move: Array.isArray(parsed.move) ? parsed.move : allStatusIds,
        flags: Array.isArray(parsed.flags) ? parsed.flags : []
      };
    }
    
    // If it's the old format (JSON array of strings)
    if (Array.isArray(parsed)) {
      const flags = parsed.filter((item: string) => item === "MANUAL_SYNC");
      const statuses = parsed.filter((item: string) => item !== "MANUAL_SYNC");
      
      if (statuses.length === 0) {
        return {
          view: allStatusIds,
          move: allStatusIds,
          flags: flags
        };
      }
      
      return {
        view: statuses,
        move: statuses, // old columns were both visible and editable/moveable
        flags: flags
      };
    }
  } catch (e) {
    console.error("Error parsing user permissions:", e);
  }
  
  return {
    view: allStatusIds,
    move: allStatusIds,
    flags: []
  };
}
