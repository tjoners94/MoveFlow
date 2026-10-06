/** "Assign All" cheat: applies the job's witness seating, which meets every requirement and every preference. */
function assignAll() {
  if (state.phase !== 'planning' || state.finished) { toast('Seating is locked once Execute begins'); return; }
  if (!state.witness) return;
  state.workstations.forEach((w) => { w.assignedEmployeeId = null; });
  for (const [empId, wsId] of state.witness) state.workstations[wsId].assignedEmployeeId = empId;
  const seated = state.workstations.filter((w) => w.assignedEmployeeId !== null);
  FX.play('drop');
  renderDynamic();
  renderTray();
  updateHud();
  toast(`Assigned ${seated.length}/${state.employees.length}: all requirements met, ${Math.round(satisfaction() * 100)}% satisfied`);
}
