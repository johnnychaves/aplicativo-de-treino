/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable react-hooks/set-state-in-effect */
// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ============================================================================
// [1] POLYFILLS & STORAGE
// ============================================================================
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    get: async (key) => ({ value: localStorage.getItem(key) }),
    set: async (key, value) => localStorage.setItem(key, value),
  };
}

const Constants = {
  STORAGE_KEY: "pl-coach-data",
  SELECTED_STUDENT_KEY: "pl-student-app-selected-student",
};

const Models = {
  getInitialRootData: () => ({
    folders: [],
    exercises: [],
    students: [],
    templates: [],
    checkIns: [],
  }),
};

function normalizeRootData(rootData) {
  const fallback = Models.getInitialRootData();
  if (!rootData || typeof rootData !== "object") return fallback;

  return {
    ...fallback,
    ...rootData,
    folders: Array.isArray(rootData.folders) ? rootData.folders : [],
    exercises: Array.isArray(rootData.exercises) ? rootData.exercises : [],
    students: Array.isArray(rootData.students) ? rootData.students : [],
    templates: Array.isArray(rootData.templates) ? rootData.templates : [],
    checkIns: Array.isArray(rootData.checkIns) ? rootData.checkIns : [],
  };
}

const StorageService = {
  async getAppData() {
    try {
      const result = await window.storage.get(Constants.STORAGE_KEY);
      if (!result?.value) return Models.getInitialRootData();
      return normalizeRootData(JSON.parse(result.value));
    } catch (error) {
      console.error("Student app loading error:", error);
      return Models.getInitialRootData();
    }
  },

  async saveAppData(nextRootData) {
    try {
      await window.storage.set(
        Constants.STORAGE_KEY,
        JSON.stringify(normalizeRootData(nextRootData))
      );
    } catch (error) {
      console.error("Student app saving error:", error);
    }
  },

  async getSelectedStudentId() {
    try {
      const result = await window.storage.get(Constants.SELECTED_STUDENT_KEY);
      return typeof result?.value === "string" ? result.value : "";
    } catch (error) {
      console.error("Selected student loading error:", error);
      return "";
    }
  },

  async saveSelectedStudentId(studentId) {
    try {
      await window.storage.set(Constants.SELECTED_STUDENT_KEY, studentId || "");
    } catch (error) {
      console.error("Selected student saving error:", error);
    }
  },
};

// ============================================================================
// [2] STUDENT APP DOMAIN ADAPTER
// ============================================================================
const StudentAppUtils = {
  formatDate(dateValue) {
    if (!dateValue) return "—";
    try {
      const parsedDate = new Date(dateValue);
      if (Number.isNaN(parsedDate.getTime())) return "—";
      return parsedDate.toLocaleDateString("pt-BR");
    } catch {
      return "—";
    }
  },

  getActiveProgram(student) {
    if (!student?.programs?.length) return null;
    return student.programs.find((program) => program.id === student.activeProgramId) || student.programs[0] || null;
  },

  getExerciseMap(rootData) {
    return Object.fromEntries((rootData?.exercises || []).map((exercise) => [exercise.id, exercise]));
  },

  getProgramSessionEntries(program, exerciseMap) {
    if (!program?.settings) return [];

    const sessions = [];
    const periodType = program.settings.periodType || "weekly";
    const frequency = program.settings.frequency || 0;
    const totalWeeks = program.settings.totalWeeks || 0;

    if (periodType === "monthly") {
      const totalMonths = Math.ceil(totalWeeks / 4);

      for (let monthIndex = 1; monthIndex <= totalMonths; monthIndex++) {
        const monthKey = `mes${monthIndex}`;
        const monthData = program.months?.[monthKey] || {};

        for (let dayIndex = 1; dayIndex <= frequency; dayIndex++) {
          const dayKey = `t${dayIndex}`;
          const dayData = monthData?.[dayKey] || { exercises: [], notes: "" };
          const exercises = (dayData.exercises || []).map((exercise, exerciseIndex) => {
            const exerciseMeta = exerciseMap[exercise.exerciseId] || null;
            return {
              id: exercise.id || `${monthKey}_${dayKey}_${exerciseIndex}`,
              exerciseId: exercise.exerciseId || "",
              exerciseName: exerciseMeta?.name || "Exercício não vinculado",
              youtubeUrl: exerciseMeta?.youtubeUrl || "",
              category: exerciseMeta?.category || "",
              muscles: exerciseMeta?.muscles || [],
              notes: exercise.notes || "",
              prescriptionType: "monthly",
              progressions: exercise.progressions || [],
            };
          });

          sessions.push({
            id: `${monthKey}_${dayKey}`,
            periodType: "monthly",
            periodIndex: monthIndex,
            dayIndex,
            label: `Mês ${monthIndex} • Treino ${dayIndex}`,
            notes: dayData.notes || "",
            exercises,
            hasContent: exercises.length > 0 || !!dayData.notes,
          });
        }
      }

      return sessions;
    }

    for (let weekIndex = 1; weekIndex <= totalWeeks; weekIndex++) {
      const weekKey = `sem${weekIndex}`;
      const weekData = program.weeks?.[weekKey] || {};

      for (let dayIndex = 1; dayIndex <= frequency; dayIndex++) {
        const dayKey = `t${dayIndex}`;
        const dayData = weekData?.[dayKey] || { exercises: [], notes: "" };
        const exercises = (dayData.exercises || []).map((exercise, exerciseIndex) => {
          const exerciseMeta = exerciseMap[exercise.exerciseId] || null;
          return {
            id: exercise.id || `${weekKey}_${dayKey}_${exerciseIndex}`,
            exerciseId: exercise.exerciseId || "",
            exerciseName: exerciseMeta?.name || "Exercício não vinculado",
            youtubeUrl: exerciseMeta?.youtubeUrl || "",
            category: exerciseMeta?.category || "",
            muscles: exerciseMeta?.muscles || [],
            notes: exercise.notes || "",
            prescriptionType: "weekly",
            sets: exercise.sets || "",
            reps: exercise.reps || "",
            percentLoad: exercise.percentLoad || "",
            load: exercise.load || "",
            rpe: exercise.rpe || "",
            rest: exercise.rest || "",
            actualSets: exercise.actualSets || [],
          };
        });

        sessions.push({
          id: `${weekKey}_${dayKey}`,
          periodType: "weekly",
          periodIndex: weekIndex,
          dayIndex,
          label: `Semana ${weekIndex} • Treino ${dayIndex}`,
          notes: dayData.notes || "",
          exercises,
          hasContent: exercises.length > 0 || !!dayData.notes,
        });
      }
    }

    return sessions;
  },

  buildQuickStatus({ activeProgram, checkIns, sessions }) {
    const configuredSessions = sessions.filter((session) => session.hasContent).length;
    const latestCheckIn = checkIns[0] || null;
    const reviewedCount = checkIns.filter((checkIn) => checkIn.status === "reviewed").length;

    return {
      activeProgramName: activeProgram?.name || "Sem planilha ativa",
      configuredSessions,
      totalCheckIns: checkIns.length,
      reviewedCheckIns: reviewedCount,
      latestCheckInStatus: latestCheckIn?.status || "none",
    };
  },

  getSessionExercisePreview(session, limit = 2) {
    return (session?.exercises || [])
      .slice(0, limit)
      .map((exercise) => exercise.exerciseName)
      .filter(Boolean);
  },

  buildHomeData({ student, activeProgram, sessions, latestCheckIn, latestReviewedCheckIn }) {
    const configuredSessions = sessions.filter((session) => session.hasContent);
    const nextSession = configuredSessions[0] || null;

    const upcomingSessions = configuredSessions.slice(0, 3).map((session) => ({
      id: session.id,
      label: session.label,
      exerciseCount: session.exercises.length,
      exercisePreview: this.getSessionExercisePreview(session),
      notes: session.notes || "",
    }));

    return {
      greetingName: student.name || "Aluno",
      activeProgramName: activeProgram?.name || "Sem planilha ativa",
      goal: student.goal || "Objetivo não definido",
      focus: student.context?.currentFocus || "",
      level: student.context?.level || "Nível não definido",
      modality: student.context?.modality || "",
      frequency: student.checkInSettings?.frequency || "—",
      nextSession: nextSession
        ? {
            label: nextSession.label,
            exerciseCount: nextSession.exercises.length,
          }
        : null,
      upcomingSessions,
      lastCheckIn: latestCheckIn
        ? {
            dateLabel: this.formatDate(latestCheckIn.createdAt),
            statusLabel: latestCheckIn.status === "reviewed" ? "Revisado" : "Enviado",
            weight: latestCheckIn.weight,
            sleepScore: latestCheckIn.sleepScore,
            fatigueScore: latestCheckIn.fatigueScore,
            painScore: latestCheckIn.painScore,
            stressScore: latestCheckIn.stressScore,
            adherenceScore: latestCheckIn.adherenceScore,
            notes: latestCheckIn.notes || "",
          }
        : null,
      recentCoachFeedback: latestReviewedCheckIn
        ? {
            dateLabel: this.formatDate(latestReviewedCheckIn.reviewedAt || latestReviewedCheckIn.createdAt),
            notes: latestReviewedCheckIn.coachNotes || "Revisão concluída pelo coach.",
          }
        : null,
    };
  },

  buildStudentAppPayload(rootData, studentId) {
    if (!rootData || !studentId) return null;

    const student = (rootData.students || []).find((item) => item.id === studentId);
    if (!student) return null;

    const activeProgram = this.getActiveProgram(student);
    const exerciseMap = this.getExerciseMap(rootData);
    const checkIns = [...(rootData.checkIns || [])]
      .filter((checkIn) => checkIn.studentId === student.id)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const sessions = this.getProgramSessionEntries(activeProgram, exerciseMap);
    const nextSession = sessions.find((session) => session.hasContent) || sessions[0] || null;
    const latestCheckIn = checkIns[0] || null;
    const latestReviewedCheckIn =
      checkIns.find((checkIn) => checkIn.status === "reviewed" && (checkIn.coachNotes || checkIn.reviewedAt)) || null;

    return {
      student: {
        id: student.id,
        name: student.name || "Aluno",
        status: student.status || "Ativo",
        goal: student.goal || "",
        email: student.email || "",
        phone: student.phone || "",
        birthDate: student.birthDate || "",
        gender: student.gender || "",
        measurements: student.measurements || {},
        checkInSettings: student.checkInSettings || {},
        context: {
          detailedGoal: student.context?.detailedGoal || "",
          currentFocus: student.context?.currentFocus || "",
          modality: student.context?.modality || "",
          level: student.context?.level || "",
          weakPoints: student.context?.weakPoints || "",
          technicalNotes: student.context?.technicalNotes || "",
        },
      },
      activeProgram: activeProgram
        ? {
            id: activeProgram.id,
            name: activeProgram.name,
            status: activeProgram.status || "active",
            periodType: activeProgram.settings?.periodType || "weekly",
            frequency: activeProgram.settings?.frequency || 0,
            totalWeeks: activeProgram.settings?.totalWeeks || 0,
            unit: activeProgram.settings?.unit || "kg",
            planning: activeProgram.planning || { mesocycles: [] },
            weeks: activeProgram.weeks || {},
            months: activeProgram.months || {},
          }
        : null,
      exerciseIndex: exerciseMap,
      checkIns,
      latestCheckIn,
      latestReviewedCheckIn,
      sessions,
      nextSession,
      quickStatus: this.buildQuickStatus({ activeProgram, checkIns, sessions }),
      home: this.buildHomeData({
        student,
        activeProgram,
        sessions,
        latestCheckIn,
        latestReviewedCheckIn,
      }),
    };
  },
};

// ============================================================================
// [3] HOOKS
// ============================================================================
function useStudentAppStorage() {
  const [rootData, setRootData] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    Promise.all([StorageService.getAppData(), StorageService.getSelectedStudentId()])
      .then(([appData, persistedStudentId]) => {
        if (!isMounted) return;

        const students = appData?.students || [];
        const fallbackStudentId = students[0]?.id || "";
        const resolvedStudentId = students.some((student) => student.id === persistedStudentId)
          ? persistedStudentId
          : fallbackStudentId;

        setRootData(normalizeRootData(appData));
        setSelectedStudentId(resolvedStudentId);
        setLoading(false);
      })
      .catch((error) => {
        console.error("Student app bootstrap error:", error);
        if (!isMounted) return;
        setRootData(Models.getInitialRootData());
        setSelectedStudentId("");
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const updateSelectedStudentId = useCallback((studentId) => {
    setSelectedStudentId(studentId);
    StorageService.saveSelectedStudentId(studentId);
  }, []);

  const saveRootData = useCallback((nextRootData) => {
    const normalizedRootData = normalizeRootData(nextRootData);
    setRootData(normalizedRootData);
    StorageService.saveAppData(normalizedRootData);
  }, []);

  return {
    rootData,
    selectedStudentId,
    updateSelectedStudentId,
    saveRootData,
    loading,
  };
}

function useStudentAppPayload(rootData, selectedStudentId) {
  return useMemo(() => StudentAppUtils.buildStudentAppPayload(rootData, selectedStudentId), [rootData, selectedStudentId]);
}

// ============================================================================
// [4] STYLES & ICONS
// ============================================================================
const Icons = {
  User: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Home: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>,
  Layers: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 12 12 17 22 12"/><polyline points="2 17 12 22 22 17"/></svg>,
  Activity: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  Clipboard: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>,
  ChevronRight: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  CheckCircle: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
};

const styles = {
  app: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 8% -10%, rgba(249,115,22,0.16), transparent 35%), radial-gradient(circle at 92% 0%, rgba(59,130,246,0.14), transparent 30%), linear-gradient(180deg, #070b14 0%, #0b1220 55%, #0c1324 100%)",
    color: "#e2e8f0",
    fontFamily: "'Inter', 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  loadScreen: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    background: "linear-gradient(180deg, #080b12 0%, #0b1220 100%)",
  },
  loadSpinner: {
    width: 42,
    height: 42,
    border: "3px solid rgba(249,115,22,0.2)",
    borderTop: "3px solid #f97316",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  shell: {
    maxWidth: 480,
    margin: "0 auto",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    background: "linear-gradient(180deg, rgba(15,23,42,0.82), rgba(15,23,42,0.65))",
    backdropFilter: "blur(18px)",
    borderLeft: "1px solid rgba(255,255,255,0.06)",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.02), 0 24px 60px rgba(2,6,23,0.65)",
  },
  header: {
    padding: "22px 18px 16px",
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: "linear-gradient(180deg, rgba(8,11,18,0.96), rgba(8,11,18,0.88))",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    backdropFilter: "blur(14px)",
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  headerProfileButton: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#e2e8f0",
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
  },
  headerProfileButtonActive: {
    border: "1px solid rgba(249,115,22,0.28)",
    background: "rgba(249,115,22,0.14)",
    color: "#f97316",
  },
  brandBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #f97316, #ea580c)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1,
    boxShadow: "0 10px 24px rgba(249,115,22,0.32)",
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: 900,
    margin: 0,
    color: "#f8fafc",
    letterSpacing: 0.3,
  },
  brandSub: {
    fontSize: 11.5,
    color: "#94a3b8",
    marginTop: 5,
  },
  content: {
    flex: 1,
    padding: "20px 18px 102px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  card: {
    background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 22,
    padding: 18,
    boxShadow: "0 14px 34px rgba(2,6,23,0.34)",
  },
  cardTitle: {
    fontSize: 15.5,
    fontWeight: 800,
    color: "#f8fafc",
    margin: 0,
    letterSpacing: 0.1,
  },
  cardText: {
    fontSize: 13.5,
    lineHeight: 1.56,
    color: "#9fb0c8",
    margin: 0,
  },
  sectionTitle: {
    fontSize: 11.5,
    fontWeight: 800,
    color: "#7386a2",
    textTransform: "uppercase",
    letterSpacing: 1,
    margin: "0 0 12px",
  },
  heroCard: {
    background: "linear-gradient(135deg, rgba(249,115,22,0.19), rgba(234,88,12,0.08) 58%, rgba(255,255,255,0.03))",
    border: "1px solid rgba(249,115,22,0.3)",
    borderRadius: 24,
    padding: 20,
    boxShadow: "0 16px 36px rgba(234,88,12,0.18)",
  },
  select: {
    width: "100%",
    appearance: "none",
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 13,
    padding: "12px 14px",
    color: "#f8fafc",
    fontSize: 14,
    outline: "none",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 11,
  },
  metricCard: {
    padding: 14,
    borderRadius: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: 800,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 900,
    color: "#f8fafc",
    letterSpacing: 0.1,
  },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 11px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.07)",
    color: "#cbd5e1",
    fontSize: 11,
    fontWeight: 800,
    border: "1px solid rgba(255,255,255,0.08)",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: "14px 2px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },
  listItemTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: "#f8fafc",
    margin: 0,
  },
  listItemMeta: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 4,
  },
  nav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    padding: "0 12px 14px",
    pointerEvents: "none",
  },
  navInner: {
    width: "100%",
    maxWidth: 480,
    background: "linear-gradient(180deg, rgba(8,11,18,0.97), rgba(15,23,42,0.92))",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 24,
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    padding: 8,
    pointerEvents: "auto",
    boxShadow: "0 16px 38px rgba(0,0,0,0.38)",
    backdropFilter: "blur(16px)",
  },
  navBtn: {
    border: "none",
    background: "transparent",
    borderRadius: 16,
    padding: "10px 4px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    color: "#64748b",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  navBtnActive: {
    background: "linear-gradient(180deg, rgba(249,115,22,0.2), rgba(249,115,22,0.1))",
    color: "#f97316",
    boxShadow: "inset 0 0 0 1px rgba(249,115,22,0.25)",
  },
  emptyState: {
    padding: 22,
    textAlign: "center",
    color: "#9fb0c8",
    borderRadius: 18,
    border: "1px dashed rgba(255,255,255,0.13)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))",
  },
};

if (typeof document !== "undefined") {
  const styleEl = document.createElement("style");
  styleEl.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    * { box-sizing: border-box; }
    body { margin: 0; }
    select option { background: #0f172a; color: #f8fafc; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 999px; }
  `;
  document.head.appendChild(styleEl);
}

// ============================================================================
// [5] UI BLOCKS
// ============================================================================
function StatusBadge({ label, tone = "neutral" }) {
  const palette = {
    neutral: {
      color: "#cbd5e1",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.08)",
    },
    success: {
      color: "#86efac",
      background: "rgba(34,197,94,0.10)",
      border: "1px solid rgba(34,197,94,0.22)",
    },
    warning: {
      color: "#fcd34d",
      background: "rgba(245,158,11,0.10)",
      border: "1px solid rgba(245,158,11,0.22)",
    },
    info: {
      color: "#93c5fd",
      background: "rgba(59,130,246,0.10)",
      border: "1px solid rgba(59,130,246,0.22)",
    },
  };

  const toneStyle = palette[tone] || palette.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 800,
        ...toneStyle,
      }}
    >
      {label}
    </span>
  );
}

function QuickActionButton({ icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(255,255,255,0.03)",
        color: "#e2e8f0",
        borderRadius: 18,
        padding: 14,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(249,115,22,0.12)",
            color: "#f97316",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: "#f8fafc" }}>{title}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{description}</div>
        </div>
      </div>
    </button>
  );
}

function StudentSwitcher({ students, selectedStudentId, onChange }) {
  return (
    <div style={styles.card}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={styles.cardTitle}>Aluno local do app</h3>
        <p style={{ ...styles.cardText, marginTop: 6 }}>
          Etapa 7 sem autenticação. O app abre o aluno selecionado neste dispositivo.
        </p>
      </div>

      <select value={selectedStudentId} onChange={(event) => onChange(event.target.value)} style={styles.select}>
        {(students || []).map((student) => (
          <option key={student.id} value={student.id}>
            {student.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function HomeTab({ payload, onOpenTrainings, onOpenCheckins, onOpenProfile }) {
  const home = payload.home;

  const latestCheckInTone =
    home.lastCheckIn?.statusLabel === "Revisado" ? "success" : home.lastCheckIn ? "warning" : "neutral";

  const feedbackTone = home.recentCoachFeedback ? "success" : "neutral";

  return (
    <>
      <div style={styles.heroCard}>
        <span style={styles.sectionTitle}>Home do aluno</span>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 24, lineHeight: 1.05, margin: "4px 0 8px", fontWeight: 900, color: "#fff" }}>
              Olá, {home.greetingName}
            </h2>
            <p style={{ ...styles.cardText, color: "#fde7d8", marginBottom: 0 }}>
              {home.focus || "Seu app já está pronto para acompanhar treinos, check-ins e feedbacks do coach."}
            </p>
          </div>

          <div
            style={{
              ...styles.brandBadge,
              width: 52,
              height: 52,
              borderRadius: 18,
              flexShrink: 0,
            }}
          >
            {home.greetingName.slice(0, 1).toUpperCase()}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <StatusBadge label={home.goal} tone="warning" />
          {home.level && <StatusBadge label={home.level} tone="neutral" />}
          {home.modality && <StatusBadge label={home.modality} tone="info" />}
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Atalhos rápidos</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Navegação rápida para os módulos mais usados do app.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <QuickActionButton
            icon={<Icons.Layers />}
            title={home.nextSession ? "Abrir treino" : "Ir para treinos"}
            description={
              home.nextSession
                ? `${home.nextSession.label} • ${home.nextSession.exerciseCount} exercício(s)`
                : "Acesse a planilha ativa e navegue pelas sessões."
            }
            onClick={onOpenTrainings}
          />

          <QuickActionButton
            icon={<Icons.Clipboard />}
            title="Abrir check-ins"
            description="Envie um novo check-in ou consulte o histórico e feedbacks."
            onClick={onOpenCheckins}
          />

          <QuickActionButton
            icon={<Icons.User />}
            title="Ver perfil"
            description="Consulte medidas, objetivo, contexto e configuração de check-in."
            onClick={onOpenProfile}
          />
        </div>
      </div>

      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Planilha ativa</span>
          <span style={{ ...styles.metricValue, fontSize: 16 }}>{home.activeProgramName}</span>
        </div>

        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Próxima sessão</span>
          <span style={{ ...styles.metricValue, fontSize: 15 }}>
            {home.nextSession ? home.nextSession.label : "Sem sessão"}
          </span>
        </div>

        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Último check-in</span>
          <div style={{ marginTop: 6 }}>
            <StatusBadge
              label={home.lastCheckIn ? `${home.lastCheckIn.dateLabel} • ${home.lastCheckIn.statusLabel}` : "Sem envio"}
              tone={latestCheckInTone}
            />
          </div>
        </div>

        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Feedback do coach</span>
          <div style={{ marginTop: 6 }}>
            <StatusBadge
              label={home.recentCoachFeedback ? `Disponível • ${home.recentCoachFeedback.dateLabel}` : "Ainda não disponível"}
              tone={feedbackTone}
            />
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Próximos treinos</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Prévia das próximas sessões já configuradas na sua planilha ativa.
          </p>
        </div>

        {home.upcomingSessions.length === 0 ? (
          <div style={styles.emptyState}>Nenhuma sessão configurada na planilha ativa.</div>
        ) : (
          <div style={styles.list}>
            {home.upcomingSessions.map((session, index) => (
              <div
                key={session.id}
                style={{
                  ...styles.listItem,
                  borderBottom:
                    index === home.upcomingSessions.length - 1
                      ? "none"
                      : "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div>
                  <p style={styles.listItemTitle}>{session.label}</p>
                  <p style={styles.listItemMeta}>
                    {session.exerciseCount} exercício(s)
                    {session.exercisePreview.length > 0 ? ` • ${session.exercisePreview.join(" • ")}` : ""}
                  </p>
                </div>

                <StatusBadge label={`${session.exerciseCount} ex.`} tone="neutral" />
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Último check-in</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Resumo do envio mais recente do aluno.
          </p>
        </div>

        {!home.lastCheckIn ? (
          <div style={styles.emptyState}>Nenhum check-in enviado ainda.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <StatusBadge label={home.lastCheckIn.dateLabel} tone="neutral" />
              <StatusBadge label={home.lastCheckIn.statusLabel} tone={latestCheckInTone} />
              {home.lastCheckIn.weight !== "" && home.lastCheckIn.weight !== null && home.lastCheckIn.weight !== undefined && (
                <StatusBadge label={`${home.lastCheckIn.weight} kg`} tone="info" />
              )}
            </div>

            <div style={styles.metricsGrid}>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Sono</span>
                <span style={{ ...styles.metricValue, fontSize: 16 }}>
                  {home.lastCheckIn.sleepScore !== "" && home.lastCheckIn.sleepScore !== null && home.lastCheckIn.sleepScore !== undefined
                    ? `${home.lastCheckIn.sleepScore}/10`
                    : "—"}
                </span>
              </div>

              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Fadiga</span>
                <span style={{ ...styles.metricValue, fontSize: 16 }}>
                  {home.lastCheckIn.fatigueScore !== "" && home.lastCheckIn.fatigueScore !== null && home.lastCheckIn.fatigueScore !== undefined
                    ? `${home.lastCheckIn.fatigueScore}/10`
                    : "—"}
                </span>
              </div>

              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Dor</span>
                <span style={{ ...styles.metricValue, fontSize: 16 }}>
                  {home.lastCheckIn.painScore !== "" && home.lastCheckIn.painScore !== null && home.lastCheckIn.painScore !== undefined
                    ? `${home.lastCheckIn.painScore}/10`
                    : "—"}
                </span>
              </div>

              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Aderência</span>
                <span style={{ ...styles.metricValue, fontSize: 16 }}>
                  {home.lastCheckIn.adherenceScore !== "" &&
                  home.lastCheckIn.adherenceScore !== null &&
                  home.lastCheckIn.adherenceScore !== undefined
                    ? `${home.lastCheckIn.adherenceScore}%`
                    : "—"}
                </span>
              </div>
            </div>

            {home.lastCheckIn.notes && (
              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <span style={styles.metricLabel}>Observações do aluno</span>
                <p style={{ ...styles.cardText, marginTop: 8 }}>{home.lastCheckIn.notes}</p>
              </div>
            )}
          </>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Feedback recente do coach</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Último retorno revisado disponível no histórico.
          </p>
        </div>

        {!home.recentCoachFeedback ? (
          <div style={styles.emptyState}>Ainda não existe feedback revisado do coach.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <StatusBadge label={home.recentCoachFeedback.dateLabel} tone="neutral" />
              <StatusBadge label="Revisado" tone="success" />
            </div>

            <p style={styles.cardText}>{home.recentCoachFeedback.notes}</p>
          </>
        )}
      </div>
    </>
  );
}

function TrainingExerciseCard({ exercise, unit }) {
  const renderValue = (label, value) => {
    if (value === "" || value === null || value === undefined) return null;

    return (
      <div
        style={{
          padding: 10,
          borderRadius: 12,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc" }}>{value}</div>
      </div>
    );
  };

  const renderWeeklyPrescription = () => {
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginTop: 12,
        }}
      >
        {renderValue("Séries", exercise.sets)}
        {renderValue("Reps", exercise.reps)}
        {renderValue("%", exercise.percentLoad ? `${exercise.percentLoad}%` : "")}
        {renderValue("Carga", exercise.load ? `${exercise.load} ${unit}` : "")}
        {renderValue("RPE", exercise.rpe)}
        {renderValue("Descanso", exercise.rest)}
      </div>
    );
  };

  const renderMonthlyPrescription = () => {
    const progressions = exercise.progressions || [];

    if (!progressions.length) {
      return (
        <div style={{ ...styles.emptyState, marginTop: 12 }}>
          Nenhuma progressão configurada para este exercício.
        </div>
      );
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {progressions.map((progression, index) => (
          <div
            key={`${exercise.id}_prog_${index}`}
            style={{
              padding: 12,
              borderRadius: 14,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#f97316" }}>
                Semana {index + 1}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              {renderValue("Séries", progression.sets)}
              {renderValue("Reps", progression.reps)}
              {renderValue("%", progression.percentLoad ? `${progression.percentLoad}%` : "")}
              {renderValue("Carga", progression.load ? `${progression.load} ${unit}` : "")}
              {renderValue("RPE", progression.rpe)}
              {renderValue("Descanso", progression.rest)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 16, fontWeight: 900, color: "#f8fafc", margin: 0 }}>
            {exercise.exerciseName}
          </p>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {exercise.category && <span style={styles.pill}>{exercise.category}</span>}
            {(exercise.muscles || []).slice(0, 3).map((muscle) => (
              <span key={muscle} style={styles.pill}>
                {muscle}
              </span>
            ))}
          </div>
        </div>

        {exercise.youtubeUrl && (
          <a
            href={exercise.youtubeUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              textDecoration: "none",
              padding: "8px 12px",
              borderRadius: 12,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#fca5a5",
              fontSize: 12,
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            Ver vídeo
          </a>
        )}
      </div>

      {exercise.prescriptionType === "monthly" ? renderMonthlyPrescription() : renderWeeklyPrescription()}

      {exercise.notes && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 14,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>
            Observações
          </div>
          <p style={{ ...styles.cardText, margin: 0 }}>{exercise.notes}</p>
        </div>
      )}
    </div>
  );
}

function buildEmptyExecutedSet() {
  return { reps: "", load: "", rpe: "" };
}

function buildExecutionDraftFromSession(session) {
  if (!session) return {};

  const draft = {};

  (session.exercises || []).forEach((exercise) => {
    if (exercise.prescriptionType === "monthly") {
      const progressions = (exercise.progressions || []).map((progression) => {
        const existing = (progression.actualSets || []).map((set) => ({
          reps: String(set.reps ?? ""),
          load: String(set.load ?? ""),
          rpe: String(set.rpe ?? ""),
        }));

        const targetCount = Math.max(parseInt(progression.sets) || 0, existing.length, 1);
        while (existing.length < targetCount) existing.push(buildEmptyExecutedSet());

        return { actualSets: existing };
      });

      draft[exercise.id] = { progressions };
      return;
    }

    const existing = (exercise.actualSets || []).map((set) => ({
      reps: String(set.reps ?? ""),
      load: String(set.load ?? ""),
      rpe: String(set.rpe ?? ""),
    }));

    const targetCount = Math.max(parseInt(exercise.sets) || 0, existing.length, 1);
    while (existing.length < targetCount) existing.push(buildEmptyExecutedSet());

    draft[exercise.id] = { actualSets: existing };
  });

  return draft;
}

function sanitizeExecutedSets(actualSets) {
  return (actualSets || [])
    .filter((set) => {
      const reps = String(set.reps ?? "").trim();
      const load = String(set.load ?? "").trim();
      const rpe = String(set.rpe ?? "").trim();
      return reps || load || rpe;
    })
    .map((set) => ({
      reps: String(set.reps ?? "").trim(),
      load: String(set.load ?? "").trim(),
      rpe: String(set.rpe ?? "").trim(),
    }));
}

function TrainingExecutionCard({ exercise, unit, value, onChange }) {
  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#f8fafc",
    fontSize: 14,
    outline: "none",
  };

  const labelStyle = {
    fontSize: 10,
    fontWeight: 800,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 6,
  };

  const smallButtonStyle = {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#e2e8f0",
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };

  const updateWeeklySetField = (setIndex, field, fieldValue) => {
    const next = {
      ...value,
      actualSets: [...(value?.actualSets || [])],
    };

    next.actualSets[setIndex] = {
      ...(next.actualSets[setIndex] || buildEmptyExecutedSet()),
      [field]: fieldValue,
    };

    onChange(next);
  };

  const addWeeklySet = () => {
    onChange({
      ...value,
      actualSets: [...(value?.actualSets || []), buildEmptyExecutedSet()],
    });
  };

  const removeWeeklySet = (setIndex) => {
    const nextSets = [...(value?.actualSets || [])];
    nextSets.splice(setIndex, 1);
    onChange({
      ...value,
      actualSets: nextSets.length ? nextSets : [buildEmptyExecutedSet()],
    });
  };

  const updateMonthlySetField = (progressionIndex, setIndex, field, fieldValue) => {
    const next = {
      ...value,
      progressions: [...(value?.progressions || [])],
    };

    const progression = {
      ...(next.progressions[progressionIndex] || { actualSets: [] }),
      actualSets: [...(next.progressions[progressionIndex]?.actualSets || [])],
    };

    progression.actualSets[setIndex] = {
      ...(progression.actualSets[setIndex] || buildEmptyExecutedSet()),
      [field]: fieldValue,
    };

    next.progressions[progressionIndex] = progression;
    onChange(next);
  };

  const addMonthlySet = (progressionIndex) => {
    const next = {
      ...value,
      progressions: [...(value?.progressions || [])],
    };

    const progression = {
      ...(next.progressions[progressionIndex] || { actualSets: [] }),
      actualSets: [...(next.progressions[progressionIndex]?.actualSets || []), buildEmptyExecutedSet()],
    };

    next.progressions[progressionIndex] = progression;
    onChange(next);
  };

  const removeMonthlySet = (progressionIndex, setIndex) => {
    const next = {
      ...value,
      progressions: [...(value?.progressions || [])],
    };

    const progression = {
      ...(next.progressions[progressionIndex] || { actualSets: [] }),
      actualSets: [...(next.progressions[progressionIndex]?.actualSets || [])],
    };

    progression.actualSets.splice(setIndex, 1);

    if (!progression.actualSets.length) {
      progression.actualSets = [buildEmptyExecutedSet()];
    }

    next.progressions[progressionIndex] = progression;
    onChange(next);
  };

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: "#f8fafc" }}>{exercise.exerciseName}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {exercise.category && <span style={styles.pill}>{exercise.category}</span>}
          {(exercise.muscles || []).slice(0, 3).map((muscle) => (
            <span key={muscle} style={styles.pill}>
              {muscle}
            </span>
          ))}
          {exercise.youtubeUrl && (
            <a
              href={exercise.youtubeUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                textDecoration: "none",
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(239,68,68,0.12)",
                color: "#fca5a5",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              Ver vídeo
            </a>
          )}
        </div>
      </div>

      {exercise.prescriptionType === "monthly" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(exercise.progressions || []).map((progression, progressionIndex) => {
            const progressionValue = value?.progressions?.[progressionIndex]?.actualSets || [buildEmptyExecutedSet()];

            return (
              <div
                key={`${exercise.id}_progression_${progressionIndex}`}
                style={{
                  padding: 12,
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: "#f97316" }}>
                    Semana {progressionIndex + 1}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                    Prescrição: {progression.sets || "—"} séries • {progression.reps || "—"} reps • {progression.load ? `${progression.load} ${unit}` : progression.percentLoad ? `${progression.percentLoad}%` : "sem carga"}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {progressionValue.map((set, setIndex) => (
                    <div
                      key={`${exercise.id}_${progressionIndex}_${setIndex}`}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 900, color: "#f8fafc", marginBottom: 10 }}>
                        Série {setIndex + 1}
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        <div>
                          <div style={labelStyle}>Reps</div>
                          <input
                            value={set.reps}
                            onChange={(event) => updateMonthlySetField(progressionIndex, setIndex, "reps", event.target.value)}
                            style={inputStyle}
                            placeholder="Ex: 8"
                          />
                        </div>

                        <div>
                          <div style={labelStyle}>Carga ({unit})</div>
                          <input
                            value={set.load}
                            onChange={(event) => updateMonthlySetField(progressionIndex, setIndex, "load", event.target.value)}
                            style={inputStyle}
                            placeholder="Ex: 60"
                          />
                        </div>

                        <div>
                          <div style={labelStyle}>RPE</div>
                          <input
                            value={set.rpe}
                            onChange={(event) => updateMonthlySetField(progressionIndex, setIndex, "rpe", event.target.value)}
                            style={inputStyle}
                            placeholder="Ex: 8"
                          />
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={() => removeMonthlySet(progressionIndex, setIndex)}
                          style={smallButtonStyle}
                        >
                          Remover série
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <button type="button" onClick={() => addMonthlySet(progressionIndex)} style={smallButtonStyle}>
                    + Adicionar série
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>
            Prescrição: {exercise.sets || "—"} séries • {exercise.reps || "—"} reps • {exercise.load ? `${exercise.load} ${unit}` : exercise.percentLoad ? `${exercise.percentLoad}%` : "sem carga"}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(value?.actualSets || [buildEmptyExecutedSet()]).map((set, setIndex) => (
              <div
                key={`${exercise.id}_set_${setIndex}`}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 900, color: "#f8fafc", marginBottom: 10 }}>
                  Série {setIndex + 1}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={labelStyle}>Reps</div>
                    <input
                      value={set.reps}
                      onChange={(event) => updateWeeklySetField(setIndex, "reps", event.target.value)}
                      style={inputStyle}
                      placeholder="Ex: 8"
                    />
                  </div>

                  <div>
                    <div style={labelStyle}>Carga ({unit})</div>
                    <input
                      value={set.load}
                      onChange={(event) => updateWeeklySetField(setIndex, "load", event.target.value)}
                      style={inputStyle}
                      placeholder="Ex: 60"
                    />
                  </div>

                  <div>
                    <div style={labelStyle}>RPE</div>
                    <input
                      value={set.rpe}
                      onChange={(event) => updateWeeklySetField(setIndex, "rpe", event.target.value)}
                      style={inputStyle}
                      placeholder="Ex: 8"
                    />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => removeWeeklySet(setIndex)}
                    style={smallButtonStyle}
                  >
                    Remover série
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button type="button" onClick={addWeeklySet} style={smallButtonStyle}>
              + Adicionar série
            </button>
          </div>
        </>
      )}

      {exercise.notes && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 14,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: "#64748b", textTransform: "uppercase", marginBottom: 6 }}>
            Observações
          </div>
          <p style={{ ...styles.cardText, margin: 0 }}>{exercise.notes}</p>
        </div>
      )}
    </div>
  );
}

function TrainingsTab({ payload, rootData, saveRootData, selectedStudentId }) {
  const sessionsWithContent = useMemo(
    () => (payload.sessions || []).filter((session) => session.hasContent),
    [payload.sessions]
  );

  const periodType = payload.activeProgram?.periodType === "monthly" ? "monthly" : "weekly";
  const periodLabel = periodType === "monthly" ? "Mês" : "Semana";
  const unit = payload.activeProgram?.unit || "kg";

  const availablePeriods = useMemo(
    () => Array.from(new Set(sessionsWithContent.map((session) => session.periodIndex))),
    [sessionsWithContent]
  );

  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [isExecutionMode, setIsExecutionMode] = useState(false);
  const [executionDraft, setExecutionDraft] = useState({});
  const [saveStatus, setSaveStatus] = useState("");
  const previousSessionIdRef = useRef("");

  useEffect(() => {
    if (!availablePeriods.length) {
      if (selectedPeriod !== null) setSelectedPeriod(null);
      return;
    }

    if (!availablePeriods.includes(selectedPeriod)) {
      setSelectedPeriod(availablePeriods[0]);
    }
  }, [availablePeriods, selectedPeriod]);

  const filteredSessions = useMemo(() => {
    if (selectedPeriod === null) return [];
    return sessionsWithContent.filter((session) => session.periodIndex === selectedPeriod);
  }, [sessionsWithContent, selectedPeriod]);

  useEffect(() => {
    if (!filteredSessions.length) {
      if (selectedSessionId !== "") setSelectedSessionId("");
      return;
    }

    const stillExists = filteredSessions.some((session) => session.id === selectedSessionId);
    if (!stillExists) {
      setSelectedSessionId(filteredSessions[0].id);
    }
  }, [filteredSessions, selectedSessionId]);

  const selectedSession =
    filteredSessions.find((session) => session.id === selectedSessionId) || null;

  useEffect(() => {
    if (!selectedSession) {
      previousSessionIdRef.current = "";
      setExecutionDraft({});
      setIsExecutionMode(false);
      setSaveStatus("");
      return;
    }

    const isSessionChanged = previousSessionIdRef.current !== selectedSession.id;
    previousSessionIdRef.current = selectedSession.id;
    setExecutionDraft(buildExecutionDraftFromSession(selectedSession));
    setIsExecutionMode(false);
    if (isSessionChanged) {
      setSaveStatus("");
    }
  }, [selectedSession]);

  const hasRecordedExecution = useMemo(() => {
    if (!selectedSession) return false;

    return (selectedSession.exercises || []).some((exercise) => {
      if (exercise.prescriptionType === "monthly") {
        return (exercise.progressions || []).some((progression) => (progression.actualSets || []).length > 0);
      }

      return (exercise.actualSets || []).length > 0;
    });
  }, [selectedSession]);

  const handleSaveExecution = () => {
    if (!selectedSession || !rootData || !selectedStudentId) return;

    const nextRootData = JSON.parse(JSON.stringify(rootData));
    const student = (nextRootData.students || []).find((item) => item.id === selectedStudentId);

    if (!student) return;

    const activeProgram =
      (student.programs || []).find((program) => program.id === student.activeProgramId) ||
      student.programs?.[0];

    if (!activeProgram) return;

    const periodKey =
      selectedSession.periodType === "monthly"
        ? `mes${selectedSession.periodIndex}`
        : `sem${selectedSession.periodIndex}`;

    const dayKey = `t${selectedSession.dayIndex}`;

    const periodContainer =
      selectedSession.periodType === "monthly" ? activeProgram.months : activeProgram.weeks;

    if (!periodContainer[periodKey]) periodContainer[periodKey] = {};
    if (!periodContainer[periodKey][dayKey]) {
      periodContainer[periodKey][dayKey] = { exercises: [], notes: "" };
    }

    const dayData = periodContainer[periodKey][dayKey];

    dayData.exercises = (dayData.exercises || []).map((exercise) => {
      const draftForExercise = executionDraft[exercise.id];
      if (!draftForExercise) return exercise;

      if (selectedSession.periodType === "monthly") {
        return {
          ...exercise,
          progressions: (exercise.progressions || []).map((progression, index) => ({
            ...progression,
            actualSets: sanitizeExecutedSets(
              draftForExercise.progressions?.[index]?.actualSets || []
            ),
          })),
        };
      }

      return {
        ...exercise,
        actualSets: sanitizeExecutedSets(draftForExercise.actualSets || []),
      };
    });

    saveRootData(nextRootData);
    setSaveStatus("Execução salva localmente.");
    setIsExecutionMode(false);
  };

  const periodButtonStyle = (active) => ({
    border: "none",
    cursor: "pointer",
    padding: "10px 14px",
    borderRadius: 14,
    fontSize: 13,
    fontWeight: 800,
    background: active ? "rgba(249,115,22,0.14)" : "rgba(255,255,255,0.04)",
    color: active ? "#f97316" : "#cbd5e1",
    borderColor: active ? "rgba(249,115,22,0.28)" : "rgba(255,255,255,0.06)",
    borderStyle: "solid",
    borderWidth: 1,
    whiteSpace: "nowrap",
  });

  const sessionButtonStyle = (active) => ({
    width: "100%",
    textAlign: "left",
    border: "1px solid",
    borderColor: active ? "rgba(249,115,22,0.28)" : "rgba(255,255,255,0.05)",
    background: active ? "rgba(249,115,22,0.08)" : "rgba(255,255,255,0.02)",
    color: "#e2e8f0",
    borderRadius: 16,
    padding: 14,
    cursor: "pointer",
  });

  const actionButtonStyle = (primary = false) => ({
    border: "1px solid",
    borderColor: primary ? "rgba(249,115,22,0.28)" : "rgba(255,255,255,0.08)",
    background: primary ? "rgba(249,115,22,0.14)" : "rgba(255,255,255,0.04)",
    color: primary ? "#f97316" : "#e2e8f0",
    borderRadius: 14,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  });

  return (
    <>
      <div style={styles.card}>
        <span style={styles.sectionTitle}>Meus treinos</span>
        <h3 style={styles.cardTitle}>Planilha ativa do aluno</h3>
        <p style={{ ...styles.cardText, marginTop: 8 }}>
          Agora a aba permite navegar pela planilha e também registrar a execução com reps, carga e RPE.
        </p>
      </div>

      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Planilha</span>
          <span style={{ ...styles.metricValue, fontSize: 15 }}>{payload.activeProgram?.name || "—"}</span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Unidade</span>
          <span style={styles.metricValue}>{unit}</span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Sessões úteis</span>
          <span style={styles.metricValue}>{sessionsWithContent.length}</span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Execução atual</span>
          <span style={styles.metricValue}>{hasRecordedExecution ? "Salva" : "Pendente"}</span>
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Selecionar {periodLabel.toLowerCase()}</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Escolha o período para navegar pelas sessões disponíveis.
          </p>
        </div>

        {!availablePeriods.length ? (
          <div style={styles.emptyState}>Nenhuma sessão configurada na planilha ativa.</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {availablePeriods.map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                style={periodButtonStyle(selectedPeriod === period)}
              >
                {periodLabel} {period}
              </button>
            ))}
          </div>
        )}
      </div>

      {availablePeriods.length > 0 && (
        <div style={styles.card}>
          <div style={{ marginBottom: 12 }}>
            <h3 style={styles.cardTitle}>Sessões do {periodLabel.toLowerCase()} selecionado</h3>
            <p style={{ ...styles.cardText, marginTop: 6 }}>
              Toque em uma sessão para ver os exercícios e registrar a execução.
            </p>
          </div>

          {!filteredSessions.length ? (
            <div style={styles.emptyState}>Nenhuma sessão com conteúdo neste período.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filteredSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setSelectedSessionId(session.id)}
                  style={sessionButtonStyle(selectedSessionId === session.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: "#f8fafc" }}>{session.label}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                        {session.exercises.length} exercício(s)
                      </div>
                    </div>

                    <span style={styles.pill}>
                      {session.exercises.length} ex.
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Detalhe da sessão</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Visualização e edição da sessão selecionada.
          </p>
        </div>

        {!selectedSession ? (
          <div style={styles.emptyState}>Selecione uma sessão para ver os exercícios.</div>
        ) : (
          <>
            <div
              style={{
                padding: 14,
                borderRadius: 16,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.05)",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: "#f8fafc" }}>
                    {selectedSession.label}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                    {selectedSession.exercises.length} exercício(s) configurado(s)
                  </div>
                  {selectedSession.notes && (
                    <p style={{ ...styles.cardText, marginTop: 10 }}>
                      {selectedSession.notes}
                    </p>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setIsExecutionMode((current) => !current)}
                    style={actionButtonStyle()}
                  >
                    {isExecutionMode ? "Cancelar edição" : hasRecordedExecution ? "Editar execução" : "Executar sessão"}
                  </button>

                  {isExecutionMode && (
                    <button
                      type="button"
                      onClick={handleSaveExecution}
                      style={actionButtonStyle(true)}
                    >
                      Salvar execução
                    </button>
                  )}
                </div>
              </div>

              {saveStatus && (
                <div style={{ marginTop: 12 }}>
                  <span style={styles.pill}>{saveStatus}</span>
                </div>
              )}
            </div>

            {selectedSession.exercises.length === 0 ? (
              <div style={styles.emptyState}>Esta sessão não possui exercícios configurados.</div>
            ) : isExecutionMode ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selectedSession.exercises.map((exercise) => (
                  <TrainingExecutionCard
                    key={exercise.id}
                    exercise={exercise}
                    unit={unit}
                    value={executionDraft[exercise.id]}
                    onChange={(nextValue) =>
                      setExecutionDraft((current) => ({
                        ...current,
                        [exercise.id]: nextValue,
                      }))
                    }
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {selectedSession.exercises.map((exercise) => (
                  <TrainingExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    unit={unit}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function buildCheckInDraft(checkIn) {
  return {
    weight: checkIn?.weight !== "" && checkIn?.weight !== null && checkIn?.weight !== undefined ? String(checkIn.weight) : "",
    sleepScore: checkIn?.sleepScore !== "" && checkIn?.sleepScore !== null && checkIn?.sleepScore !== undefined ? String(checkIn.sleepScore) : "",
    fatigueScore: checkIn?.fatigueScore !== "" && checkIn?.fatigueScore !== null && checkIn?.fatigueScore !== undefined ? String(checkIn.fatigueScore) : "",
    painScore: checkIn?.painScore !== "" && checkIn?.painScore !== null && checkIn?.painScore !== undefined ? String(checkIn.painScore) : "",
    stressScore: checkIn?.stressScore !== "" && checkIn?.stressScore !== null && checkIn?.stressScore !== undefined ? String(checkIn.stressScore) : "",
    adherenceScore: checkIn?.adherenceScore !== "" && checkIn?.adherenceScore !== null && checkIn?.adherenceScore !== undefined ? String(checkIn.adherenceScore) : "",
    notes: checkIn?.notes || "",
  };
}

function normalizeCheckInNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = Number(raw.replace(",", "."));
  return Number.isFinite(normalized) ? normalized : raw;
}

function createCheckInId() {
  return `checkin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function CheckinsTab({ payload, rootData, saveRootData, selectedStudentId }) {
  const [formMode, setFormMode] = useState(null); // null | "new" | "edit"
  const [editingCheckInId, setEditingCheckInId] = useState("");
  const [selectedCheckInId, setSelectedCheckInId] = useState(payload.checkIns[0]?.id || "");
  const [draft, setDraft] = useState(buildCheckInDraft(null));
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    const firstId = payload.checkIns[0]?.id || "";
    const exists = payload.checkIns.some((checkIn) => checkIn.id === selectedCheckInId);

    if (!exists) {
      setSelectedCheckInId(firstId);
    }
  }, [payload.checkIns, selectedCheckInId]);

  useEffect(() => {
    setFormMode(null);
    setEditingCheckInId("");
    setDraft(buildCheckInDraft(null));
    setSaveStatus("");
  }, [payload.student.id]);

  const selectedCheckIn =
    payload.checkIns.find((checkIn) => checkIn.id === selectedCheckInId) || payload.checkIns[0] || null;

  const inputStyle = {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#f8fafc",
    fontSize: 14,
    outline: "none",
  };

  const labelStyle = {
    fontSize: 10,
    fontWeight: 800,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 6,
  };

  const actionButtonStyle = (primary = false) => ({
    border: "1px solid",
    borderColor: primary ? "rgba(249,115,22,0.28)" : "rgba(255,255,255,0.08)",
    background: primary ? "rgba(249,115,22,0.14)" : "rgba(255,255,255,0.04)",
    color: primary ? "#f97316" : "#e2e8f0",
    borderRadius: 14,
    padding: "10px 14px",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
  });

  const smallButtonStyle = {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    color: "#e2e8f0",
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  };

  const startNewCheckIn = () => {
    setFormMode("new");
    setEditingCheckInId("");
    setDraft(buildCheckInDraft(null));
    setSaveStatus("");
  };

  const startEditCheckIn = (checkIn) => {
    if (!checkIn || checkIn.status === "reviewed") return;

    setFormMode("edit");
    setEditingCheckInId(checkIn.id);
    setDraft(buildCheckInDraft(checkIn));
    setSaveStatus("");
  };

  const cancelForm = () => {
    setFormMode(null);
    setEditingCheckInId("");
    setDraft(buildCheckInDraft(null));
    setSaveStatus("");
  };

  const handleSaveCheckIn = () => {
    if (!rootData || !selectedStudentId) return;

    const nextRootData = JSON.parse(JSON.stringify(rootData));
    nextRootData.checkIns = nextRootData.checkIns || [];

    if (formMode === "edit" && editingCheckInId) {
      nextRootData.checkIns = nextRootData.checkIns.map((checkIn) => {
        if (checkIn.id !== editingCheckInId) return checkIn;

        return {
          ...checkIn,
          weight: normalizeCheckInNumber(draft.weight),
          sleepScore: normalizeCheckInNumber(draft.sleepScore),
          fatigueScore: normalizeCheckInNumber(draft.fatigueScore),
          painScore: normalizeCheckInNumber(draft.painScore),
          stressScore: normalizeCheckInNumber(draft.stressScore),
          adherenceScore: normalizeCheckInNumber(draft.adherenceScore),
          notes: draft.notes.trim(),
        };
      });

      saveRootData(nextRootData);
      setSelectedCheckInId(editingCheckInId);
      setFormMode(null);
      setEditingCheckInId("");
      setSaveStatus("Check-in atualizado com sucesso.");
      return;
    }

    const newCheckIn = {
      id: createCheckInId(),
      studentId: selectedStudentId,
      programId: payload.activeProgram?.id || "",
      createdAt: new Date().toISOString(),
      frequencyType: payload.latestCheckIn?.frequencyType || payload.student.checkInSettings?.frequency || "manual",
      status: "pending",
      weight: normalizeCheckInNumber(draft.weight),
      sleepScore: normalizeCheckInNumber(draft.sleepScore),
      fatigueScore: normalizeCheckInNumber(draft.fatigueScore),
      painScore: normalizeCheckInNumber(draft.painScore),
      stressScore: normalizeCheckInNumber(draft.stressScore),
      adherenceScore: normalizeCheckInNumber(draft.adherenceScore),
      notes: draft.notes.trim(),
      coachNotes: "",
      reviewedAt: "",
    };

    nextRootData.checkIns.unshift(newCheckIn);
    saveRootData(nextRootData);
    setSelectedCheckInId(newCheckIn.id);
    setFormMode(null);
    setEditingCheckInId("");
    setSaveStatus("Check-in enviado com sucesso.");
  };

  return (
    <>
      <div style={styles.card}>
        <span style={styles.sectionTitle}>Check-ins</span>
        <h3 style={styles.cardTitle}>Histórico, envio e edição</h3>
        <p style={{ ...styles.cardText, marginTop: 8 }}>
          Agora o aluno já pode criar novo check-in, editar registros pendentes e acompanhar feedback revisado do coach.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button type="button" onClick={startNewCheckIn} style={actionButtonStyle(true)}>
            Novo check-in
          </button>

          {saveStatus && <StatusBadge label={saveStatus} tone="success" />}
        </div>
      </div>

      {(formMode === "new" || formMode === "edit") && (
        <div style={styles.card}>
          <div style={{ marginBottom: 12 }}>
            <h3 style={styles.cardTitle}>
              {formMode === "edit" ? "Editar check-in" : "Novo check-in"}
            </h3>
            <p style={{ ...styles.cardText, marginTop: 6 }}>
              Preencha os dados do check-in do aluno.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={labelStyle}>Peso (kg)</div>
              <input
                style={inputStyle}
                value={draft.weight}
                onChange={(event) => setDraft((current) => ({ ...current, weight: event.target.value }))}
                placeholder="Ex: 82.5"
              />
            </div>

            <div>
              <div style={labelStyle}>Sono (0-10)</div>
              <input
                style={inputStyle}
                value={draft.sleepScore}
                onChange={(event) => setDraft((current) => ({ ...current, sleepScore: event.target.value }))}
                placeholder="Ex: 8"
              />
            </div>

            <div>
              <div style={labelStyle}>Fadiga (0-10)</div>
              <input
                style={inputStyle}
                value={draft.fatigueScore}
                onChange={(event) => setDraft((current) => ({ ...current, fatigueScore: event.target.value }))}
                placeholder="Ex: 5"
              />
            </div>

            <div>
              <div style={labelStyle}>Dor (0-10)</div>
              <input
                style={inputStyle}
                value={draft.painScore}
                onChange={(event) => setDraft((current) => ({ ...current, painScore: event.target.value }))}
                placeholder="Ex: 2"
              />
            </div>

            <div>
              <div style={labelStyle}>Stress (0-10)</div>
              <input
                style={inputStyle}
                value={draft.stressScore}
                onChange={(event) => setDraft((current) => ({ ...current, stressScore: event.target.value }))}
                placeholder="Ex: 4"
              />
            </div>

            <div>
              <div style={labelStyle}>Aderência (%)</div>
              <input
                style={inputStyle}
                value={draft.adherenceScore}
                onChange={(event) => setDraft((current) => ({ ...current, adherenceScore: event.target.value }))}
                placeholder="Ex: 90"
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={labelStyle}>Observações</div>
            <textarea
              style={{
                ...inputStyle,
                minHeight: 110,
                resize: "vertical",
                fontFamily: "inherit",
              }}
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Como foi a semana? Alguma dor, dificuldade, falta de energia, alteração de rotina, etc."
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" onClick={cancelForm} style={actionButtonStyle()}>
              Cancelar
            </button>
            <button type="button" onClick={handleSaveCheckIn} style={actionButtonStyle(true)}>
              Salvar check-in
            </button>
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Histórico</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Toque em um registro para consultar os detalhes e o feedback do coach.
          </p>
        </div>

        {payload.checkIns.length === 0 ? (
          <div style={styles.emptyState}>Este aluno ainda não possui check-ins.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {payload.checkIns.map((checkIn) => {
              const isSelected = selectedCheckInId === checkIn.id;
              const isReviewed = checkIn.status === "reviewed";

              return (
                <div
                  key={checkIn.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCheckInId(checkIn.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedCheckInId(checkIn.id);
                    }
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "1px solid",
                    borderColor: isSelected ? "rgba(249,115,22,0.28)" : "rgba(255,255,255,0.05)",
                    background: isSelected ? "rgba(249,115,22,0.08)" : "rgba(255,255,255,0.02)",
                    color: "#e2e8f0",
                    borderRadius: 16,
                    padding: 14,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: "#f8fafc" }}>
                        {StudentAppUtils.formatDate(checkIn.createdAt)}
                      </div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                        Registro do aluno
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {checkIn.weight !== "" && checkIn.weight !== null && checkIn.weight !== undefined && (
                        <StatusBadge label={`${checkIn.weight} kg`} tone="info" />
                      )}
                      <StatusBadge label={isReviewed ? "Revisado" : "Pendente"} tone={isReviewed ? "success" : "warning"} />
                      {!isReviewed && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            startEditCheckIn(checkIn);
                          }}
                          style={smallButtonStyle}
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Detalhe do check-in</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Resumo do registro selecionado e eventual feedback do coach.
          </p>
        </div>

        {!selectedCheckIn ? (
          <div style={styles.emptyState}>Selecione um check-in para ver os detalhes.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <StatusBadge label={StudentAppUtils.formatDate(selectedCheckIn.createdAt)} tone="neutral" />
              <StatusBadge
                label={selectedCheckIn.status === "reviewed" ? "Revisado" : "Enviado"}
                tone={selectedCheckIn.status === "reviewed" ? "success" : "warning"}
              />
              {selectedCheckIn.weight !== "" && selectedCheckIn.weight !== null && selectedCheckIn.weight !== undefined && (
                <StatusBadge label={`${selectedCheckIn.weight} kg`} tone="info" />
              )}
            </div>

            <div style={styles.metricsGrid}>
              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Sono</span>
                <span style={{ ...styles.metricValue, fontSize: 16 }}>
                  {selectedCheckIn.sleepScore !== "" && selectedCheckIn.sleepScore !== null && selectedCheckIn.sleepScore !== undefined
                    ? `${selectedCheckIn.sleepScore}/10`
                    : "—"}
                </span>
              </div>

              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Fadiga</span>
                <span style={{ ...styles.metricValue, fontSize: 16 }}>
                  {selectedCheckIn.fatigueScore !== "" && selectedCheckIn.fatigueScore !== null && selectedCheckIn.fatigueScore !== undefined
                    ? `${selectedCheckIn.fatigueScore}/10`
                    : "—"}
                </span>
              </div>

              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Dor</span>
                <span style={{ ...styles.metricValue, fontSize: 16 }}>
                  {selectedCheckIn.painScore !== "" && selectedCheckIn.painScore !== null && selectedCheckIn.painScore !== undefined
                    ? `${selectedCheckIn.painScore}/10`
                    : "—"}
                </span>
              </div>

              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Stress</span>
                <span style={{ ...styles.metricValue, fontSize: 16 }}>
                  {selectedCheckIn.stressScore !== "" && selectedCheckIn.stressScore !== null && selectedCheckIn.stressScore !== undefined
                    ? `${selectedCheckIn.stressScore}/10`
                    : "—"}
                </span>
              </div>

              <div style={styles.metricCard}>
                <span style={styles.metricLabel}>Aderência</span>
                <span style={{ ...styles.metricValue, fontSize: 16 }}>
                  {selectedCheckIn.adherenceScore !== "" && selectedCheckIn.adherenceScore !== null && selectedCheckIn.adherenceScore !== undefined
                    ? `${selectedCheckIn.adherenceScore}%`
                    : "—"}
                </span>
              </div>
            </div>

            {selectedCheckIn.notes && (
              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 16,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <span style={styles.metricLabel}>Observações do aluno</span>
                <p style={{ ...styles.cardText, marginTop: 8 }}>{selectedCheckIn.notes}</p>
              </div>
            )}

            <div
              style={{
                marginTop: 14,
                padding: 14,
                borderRadius: 16,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <span style={styles.metricLabel}>Feedback do coach</span>

              {selectedCheckIn.coachNotes ? (
                <>
                  {selectedCheckIn.reviewedAt && (
                    <div style={{ marginTop: 8 }}>
                      <StatusBadge
                        label={`Revisado em ${StudentAppUtils.formatDate(selectedCheckIn.reviewedAt)}`}
                        tone="success"
                      />
                    </div>
                  )}
                  <p style={{ ...styles.cardText, marginTop: 10 }}>{selectedCheckIn.coachNotes}</p>
                </>
              ) : (
                <p style={{ ...styles.cardText, marginTop: 8 }}>
                  Ainda não existe feedback revisado para este check-in.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ProfileTab({ payload }) {
  const student = payload.student;
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactDraft, setContactDraft] = useState({
    email: student.email || "",
    phone: student.phone || "",
  });
  const [contactSaveStatus, setContactSaveStatus] = useState("");
  const previousStudentIdRef = useRef(student.id);

  const infoCardStyle = {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
  };

  const sectionBoxStyle = {
    padding: 14,
    borderRadius: 16,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
  };
  const inputStyle = {
    width: "100%",
    padding: "11px 12px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#f8fafc",
    fontSize: 14,
    outline: "none",
  };
  const actionButtonStyle = (primary = false) => ({
    border: "1px solid",
    borderColor: primary ? "rgba(249,115,22,0.28)" : "rgba(255,255,255,0.08)",
    background: primary ? "rgba(249,115,22,0.14)" : "rgba(255,255,255,0.04)",
    color: primary ? "#f97316" : "#e2e8f0",
    borderRadius: 12,
    padding: "9px 12px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  });

  useEffect(() => {
    if (previousStudentIdRef.current === student.id) return;
    previousStudentIdRef.current = student.id;
    setContactDraft({
      email: student.email || "",
      phone: student.phone || "",
    });
    setIsEditingContact(false);
    setContactSaveStatus("");
  }, [student.id, student.email, student.phone]);

  const handleCancelContactEdit = () => {
    setContactDraft({
      email: student.email || "",
      phone: student.phone || "",
    });
    setIsEditingContact(false);
    setContactSaveStatus("");
  };

  const handleSaveContactEdit = () => {
    payload.updateStudentContact({
      email: contactDraft.email.trim(),
      phone: contactDraft.phone.trim(),
    });
    setIsEditingContact(false);
    setContactSaveStatus("Contato atualizado com sucesso.");
  };

  const renderTextBlock = (label, value, emptyText = "Não informado.") => (
    <div style={sectionBoxStyle}>
      <span style={styles.metricLabel}>{label}</span>
      <p style={{ ...styles.cardText, marginTop: 8 }}>{value || emptyText}</p>
    </div>
  );

  const measurementEntries = Object.entries(student.measurements || {}).filter(
    ([, value]) => value !== "" && value !== null && value !== undefined
  );

  const checkInSettingEntries = Object.entries(student.checkInSettings || {}).filter(
    ([, value]) => value !== "" && value !== null && value !== undefined
  );

  return (
    <>
      <div style={styles.heroCard}>
        <span style={styles.sectionTitle}>Perfil do aluno</span>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <h2 style={{ fontSize: 24, lineHeight: 1.05, margin: "4px 0 8px", fontWeight: 900, color: "#fff" }}>
              {student.name}
            </h2>
            <p style={{ ...styles.cardText, color: "#fde7d8", marginBottom: 0 }}>
              {student.context.currentFocus || "Perfil consolidado do aluno para consulta rápida no app."}
            </p>
          </div>

          <div
            style={{
              ...styles.brandBadge,
              width: 52,
              height: 52,
              borderRadius: 18,
              flexShrink: 0,
            }}
          >
            {student.name.slice(0, 1).toUpperCase()}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <span style={{ ...styles.pill, background: "rgba(255,255,255,0.14)", color: "#fff" }}>
            {student.goal || "Objetivo não definido"}
          </span>
          {student.context.level && (
            <span style={{ ...styles.pill, background: "rgba(255,255,255,0.14)", color: "#fff" }}>
              {student.context.level}
            </span>
          )}
          {student.context.modality && (
            <span style={{ ...styles.pill, background: "rgba(255,255,255,0.14)", color: "#fff" }}>
              {student.context.modality}
            </span>
          )}
          <span style={{ ...styles.pill, background: "rgba(255,255,255,0.14)", color: "#fff" }}>
            {student.status || "Ativo"}
          </span>
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Resumo geral</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Dados principais do aluno e do contexto atual.
          </p>
        </div>

        <div style={styles.metricsGrid}>
          <div style={styles.metricCard}>
            <span style={styles.metricLabel}>Objetivo</span>
            <span style={{ ...styles.metricValue, fontSize: 15 }}>{student.goal || "—"}</span>
          </div>

          <div style={styles.metricCard}>
            <span style={styles.metricLabel}>Nível</span>
            <span style={{ ...styles.metricValue, fontSize: 15 }}>{student.context.level || "—"}</span>
          </div>

          <div style={styles.metricCard}>
            <span style={styles.metricLabel}>Modalidade</span>
            <span style={{ ...styles.metricValue, fontSize: 15 }}>{student.context.modality || "—"}</span>
          </div>

          <div style={styles.metricCard}>
            <span style={styles.metricLabel}>Check-in</span>
            <span style={{ ...styles.metricValue, fontSize: 15 }}>
              {student.checkInSettings?.frequency || "—"}
            </span>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Dados pessoais</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Informações básicas do aluno para consulta. Apenas email e telefone podem ser editados no app do aluno.
          </p>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
          <StatusBadge label="Somente contato editável" tone="info" />
          {!isEditingContact ? (
            <button type="button" onClick={() => setIsEditingContact(true)} style={actionButtonStyle(true)}>
              Editar contato
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={handleCancelContactEdit} style={actionButtonStyle()}>
                Cancelar
              </button>
              <button type="button" onClick={handleSaveContactEdit} style={actionButtonStyle(true)}>
                Salvar contato
              </button>
            </div>
          )}
        </div>

        {isEditingContact && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 14,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label htmlFor="profile-email" style={{ ...styles.metricLabel, display: "block", marginBottom: 6 }}>
                  Email
                </label>
                <input
                  id="profile-email"
                  type="email"
                  value={contactDraft.email}
                  onChange={(event) => setContactDraft((current) => ({ ...current, email: event.target.value }))}
                  style={inputStyle}
                  placeholder="voce@email.com"
                />
              </div>
              <div>
                <label htmlFor="profile-phone" style={{ ...styles.metricLabel, display: "block", marginBottom: 6 }}>
                  Telefone
                </label>
                <input
                  id="profile-phone"
                  value={contactDraft.phone}
                  onChange={(event) => setContactDraft((current) => ({ ...current, phone: event.target.value }))}
                  style={inputStyle}
                  placeholder="11999999999"
                />
              </div>
            </div>
          </div>
        )}

        {contactSaveStatus && (
          <div style={{ marginBottom: 12 }}>
            <StatusBadge label={contactSaveStatus} tone="success" />
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={infoCardStyle}>
            <span style={styles.metricLabel}>Email</span>
            <p style={{ ...styles.cardText, marginTop: 8 }}>{student.email || "Não informado."}</p>
          </div>

          <div style={infoCardStyle}>
            <span style={styles.metricLabel}>Telefone</span>
            <p style={{ ...styles.cardText, marginTop: 8 }}>{student.phone || "Não informado."}</p>
          </div>

          <div style={infoCardStyle}>
            <span style={styles.metricLabel}>Nascimento</span>
            <p style={{ ...styles.cardText, marginTop: 8 }}>
              {student.birthDate ? StudentAppUtils.formatDate(student.birthDate) : "Não informado."}
            </p>
          </div>

          <div style={infoCardStyle}>
            <span style={styles.metricLabel}>Gênero</span>
            <p style={{ ...styles.cardText, marginTop: 8 }}>{student.gender || "Não informado."}</p>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Medidas</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Medidas atuais salvas na baseline do coach.
          </p>
        </div>

        {measurementEntries.length === 0 ? (
          <div style={styles.emptyState}>Nenhuma medida cadastrada para este aluno.</div>
        ) : (
          <div style={styles.metricsGrid}>
            {measurementEntries.map(([key, value]) => (
              <div key={key} style={styles.metricCard}>
                <span style={styles.metricLabel}>{key}</span>
                <span style={{ ...styles.metricValue, fontSize: 15 }}>{String(value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Contexto do treino</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Informações qualitativas importantes para o acompanhamento.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {renderTextBlock("Objetivo detalhado", student.context.detailedGoal)}
          {renderTextBlock("Foco atual", student.context.currentFocus)}
          {renderTextBlock("Pontos fracos", student.context.weakPoints)}
          {renderTextBlock("Notas técnicas", student.context.technicalNotes)}
        </div>
      </div>

      <div style={styles.card}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={styles.cardTitle}>Configuração de check-in</h3>
          <p style={{ ...styles.cardText, marginTop: 6 }}>
            Configurações ativas de acompanhamento do aluno.
          </p>
        </div>

        {checkInSettingEntries.length === 0 ? (
          <div style={styles.emptyState}>Nenhuma configuração de check-in cadastrada.</div>
        ) : (
          <div style={styles.metricsGrid}>
            {checkInSettingEntries.map(([key, value]) => (
              <div key={key} style={styles.metricCard}>
                <span style={styles.metricLabel}>{key}</span>
                <span style={{ ...styles.metricValue, fontSize: 15 }}>{String(value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function BottomNav({ activeTab, onChange }) {
  const tabs = [
    { id: "home", label: "Home", icon: <Icons.Home /> },
    { id: "trainings", label: "Treinos", icon: <Icons.Layers /> },
    { id: "checkins", label: "Check-ins", icon: <Icons.Clipboard /> },
  ];

  return (
    <nav aria-label="Navegação inferior" style={styles.nav}>
      <div style={styles.navInner}>
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{ ...styles.navBtn, ...(activeTab === tab.id ? styles.navBtnActive : {}) }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

// ============================================================================
// [6] MAIN STUDENT APP
// ============================================================================
export default function App() {
  const { rootData, selectedStudentId, updateSelectedStudentId, saveRootData, loading } = useStudentAppStorage();
  const payload = useStudentAppPayload(rootData, selectedStudentId);
  const [activeTab, setActiveTab] = useState("home");
  const updateStudentContact = useCallback(
    ({ email, phone }) => {
      if (!rootData || !selectedStudentId) return;

      const nextRootData = JSON.parse(JSON.stringify(rootData));
      nextRootData.students = (nextRootData.students || []).map((student) => {
        if (student.id !== selectedStudentId) return student;
        return {
          ...student,
          email,
          phone,
        };
      });

      saveRootData(nextRootData);
    },
    [rootData, saveRootData, selectedStudentId]
  );

  const students = rootData?.students || [];

  if (loading) {
    return (
      <div style={styles.loadScreen}>
        <div style={styles.loadSpinner} />
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>Carregando App do Aluno...</p>
      </div>
    );
  }

  if (!students.length) {
    return (
      <div style={styles.app}>
        <div style={{ ...styles.shell, justifyContent: "center", padding: 18 }}>
          <div style={styles.emptyState}>
            <p style={{ ...styles.cardTitle, marginBottom: 8 }}>Nenhum aluno encontrado</p>
            <p style={styles.cardText}>
              O Student App depende da baseline local do coach. Cadastre pelo menos um aluno no sistema principal para usar este app.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.brandRow}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={styles.brandBadge}>STX</div>
              <div>
                <h1 style={styles.brandTitle}>App do Aluno</h1>
                <p style={styles.brandSub}>Etapa 7 • refinamentos finais de UX</p>
              </div>
            </div>
            <div style={styles.headerActions}>
              <button
                type="button"
                aria-label="Abrir perfil"
                onClick={() => setActiveTab("profile")}
                style={{
                  ...styles.headerProfileButton,
                  ...(activeTab === "profile" ? styles.headerProfileButtonActive : {}),
                }}
              >
                <Icons.User />
                Perfil
              </button>
              <span style={styles.pill}>MVP local</span>
            </div>
          </div>

          <StudentSwitcher
            students={students}
            selectedStudentId={selectedStudentId}
            onChange={(studentId) => {
              updateSelectedStudentId(studentId);
              setActiveTab("home");
            }}
          />
        </header>

        <main style={styles.content}>
          {!payload && <div style={styles.emptyState}>Não foi possível montar o payload do aluno selecionado.</div>}
          {payload && activeTab === "home" && (
            <HomeTab
              payload={payload}
              onOpenTrainings={() => setActiveTab("trainings")}
              onOpenCheckins={() => setActiveTab("checkins")}
              onOpenProfile={() => setActiveTab("profile")}
            />
          )}
          {payload && activeTab === "trainings" && (
            <TrainingsTab
              payload={payload}
              rootData={rootData}
              saveRootData={saveRootData}
              selectedStudentId={selectedStudentId}
            />
          )}
          {payload && activeTab === "checkins" && (
            <CheckinsTab
              payload={payload}
              rootData={rootData}
              saveRootData={saveRootData}
              selectedStudentId={selectedStudentId}
            />
          )}
          {payload && activeTab === "profile" && (
            <ProfileTab
              payload={{
                ...payload,
                updateStudentContact,
              }}
            />
          )}
        </main>
      </div>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
