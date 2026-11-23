import { useCallback, useEffect, useState } from "react";

import { db } from "../state/db";

/**
 * Open state for the project settings dialog. For a new project the dialog
 * opens on mount, and closing it sets `settingsConfirmed` on the project
 * record. A later load of the same `?new=true` URL then does not open it again.
 */
export function useNewProjectSettingsDialog(projectId: string, isNewProject: boolean) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isNewProject) return;
    let cancelled = false;
    void db.projects.get(projectId).then((project) => {
      if (!cancelled && project && !project.settingsConfirmed) {
        setOpen(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isNewProject, projectId]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && isNewProject) {
        void db.projects.update(projectId, { settingsConfirmed: true });
      }
    },
    [isNewProject, projectId],
  );

  return [open, handleOpenChange] as const;
}
