import { bedById, COL } from './ontology.js';
import { onModeChange, setMode } from './state.js';

export function initUI() {
  const modeName = document.getElementById('modeName');
  const modeSub = document.getElementById('modeSub');
  const modeDot = document.getElementById('modeDot');
  const backBtn = document.getElementById('backBtn');
  const stageT = document.getElementById('stageT');
  const stageS = document.getElementById('stageS');

  backBtn.onclick = () => setMode('floor');

  onModeChange((mode, focusId) => {
    const patient = mode === 'patient';
    backBtn.style.display = patient ? 'flex' : 'none';
    modeName.textContent = patient ? 'Patient Hub' : 'Command Hub';
    if (patient) {
      const b = bedById(focusId);
      modeSub.textContent = '· bedside · ' + focusId;
      modeDot.style.background = COL[b.patient.acuity];
      stageT.textContent = 'Body Scan · ' + focusId;
      stageS.textContent = b.patient.name + ' · ' + b.patient.dx;
    } else {
      modeSub.textContent = '· nurse bay · macro';
      modeDot.style.background = 'var(--teal)';
      stageT.textContent = 'Digital State · ICU Floor';
      stageS.textContent = 'Live spatial twin · 8 monitored beds';
    }
  });
}
