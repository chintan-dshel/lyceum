import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { curriculum } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';
import TopBar from '../components/TopBar.jsx';

// ─── Layout constants ──────────────────────────────────────
const COL_W  = 220;  // px per semester column
const NODE_W = 180;
const NODE_H = 72;
const NODE_GAP = 20;
const COL_PAD_X = 20;
const TOP_PAD = 60;
const SIDE_PAD = 40;

function statusColor(status) {
  if (status === 'completed') return { bg: 'oklch(91% 0.07 145)', border: 'oklch(72% 0.12 145)', text: 'oklch(30% 0.1 145)', dot: 'oklch(55% 0.14 145)' };
  if (status === 'active')    return { bg: 'oklch(93% 0.06 265)', border: 'oklch(75% 0.12 265)', text: 'oklch(30% 0.12 265)', dot: 'oklch(52% 0.14 265)' };
  return { bg: '#f5f4f0', border: '#d8d4cc', text: '#555', dot: '#bbb' };
}

function courseTypeTag(courseType) {
  if (courseType === 'core')     return { label: 'Core',     bg: 'oklch(93% 0.06 265)', color: 'oklch(35% 0.12 265)' };
  if (courseType === 'elective') return { label: 'Elective', bg: 'oklch(95% 0.05 75)',  color: 'oklch(40% 0.1 75)' };
  return { label: courseType, bg: '#eee', color: '#555' };
}

// ─── Compute layout positions ──────────────────────────────
function computeLayout(courses) {
  const bySemester = {};
  for (const c of courses) {
    const s = c.semesterNumber;
    if (!bySemester[s]) bySemester[s] = [];
    bySemester[s].push(c);
  }

  const semesters = Object.keys(bySemester).map(Number).sort((a, b) => a - b);
  const positions = {};
  let maxH = 0;

  for (const sem of semesters) {
    const cols = bySemester[sem];
    const x = SIDE_PAD + (sem - 1) * COL_W + COL_PAD_X;
    cols.forEach((c, i) => {
      const y = TOP_PAD + i * (NODE_H + NODE_GAP);
      positions[c.id] = { x, y, sem };
      maxH = Math.max(maxH, y + NODE_H);
    });
  }

  const svgW = SIDE_PAD * 2 + semesters.length * COL_W;
  const svgH = maxH + SIDE_PAD;
  return { positions, semesters, bySemester, svgW, svgH };
}

// ─── SVG edge path (horizontal cubic bezier) ──────────────
function Edge({ source, target, positions }) {
  const s = positions[source];
  const t = positions[target];
  if (!s || !t) return null;

  const x1 = s.x + NODE_W;
  const y1 = s.y + NODE_H / 2;
  const x2 = t.x;
  const y2 = t.y + NODE_H / 2;
  const cx = (x1 + x2) / 2;

  return (
    <path
      d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`}
      fill="none"
      stroke="oklch(72% 0.08 265)"
      strokeWidth={1.5}
      strokeDasharray="5 4"
      opacity={0.7}
      markerEnd="url(#arrowhead)"
    />
  );
}

// ─── SVG course node ──────────────────────────────────────
function CourseNode({ course, pos, selected, onClick }) {
  const { bg, border, text, dot } = statusColor(course.status);
  const tag = courseTypeTag(course.courseType);
  const isClickable = !!course.navigateTo;

  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      onClick={() => onClick(course)}
      style={{ cursor: isClickable ? 'pointer' : 'default' }}
    >
      <rect
        width={NODE_W} height={NODE_H} rx={10}
        fill={selected ? 'oklch(88% 0.1 265)' : bg}
        stroke={selected ? 'oklch(52% 0.14 265)' : border}
        strokeWidth={selected ? 2 : 1}
        style={{ filter: selected ? 'drop-shadow(0 2px 8px oklch(52% 0.14 265 / 0.3))' : 'none', transition: 'all .15s' }}
      />
      {/* Status dot */}
      <circle cx={14} cy={14} r={5} fill={dot} />
      {/* Course code */}
      <text x={24} y={18} fontSize={9} fontFamily="monospace" fill={text} fontWeight={600} letterSpacing="0.06em">
        {course.code}
      </text>
      {/* Course title — wrap at ~22 chars */}
      <foreignObject x={8} y={24} width={NODE_W - 16} height={NODE_H - 32}>
        <div xmlns="http://www.w3.org/1999/xhtml" style={{
          fontSize: 12, lineHeight: 1.35, color: text, fontWeight: 500,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {course.label}
        </div>
      </foreignObject>
      {/* Course type tag */}
      <g transform={`translate(${NODE_W - 52}, ${NODE_H - 18})`}>
        <rect width={48} height={14} rx={4} fill={tag.bg} />
        <text x={24} y={10} fontSize={8.5} textAnchor="middle" fill={tag.color} fontWeight={500}>
          {tag.label}
        </text>
      </g>
    </g>
  );
}

export default function KnowledgeGraphView() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragging = useRef(null);
  const svgRef = useRef(null);

  useEffect(() => {
    curriculum.graph(programId)
      .then(data => setGraphData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [programId]);

  const courses = graphData?.nodes?.filter(n => n.type === 'course') || [];
  const prereqEdges = graphData?.edges?.filter(e => e.type === 'course_prereq') || [];

  const { positions, semesters, bySemester, svgW, svgH } = computeLayout(courses);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.min(2, Math.max(0.4, z - e.deltaY * 0.001)));
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.target.tagName === 'rect' || e.target.tagName === 'text' || e.target.tagName === 'circle') return;
    dragging.current = { startX: e.clientX - pan.x, startY: e.clientY - pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    setPan({ x: e.clientX - dragging.current.startX, y: e.clientY - dragging.current.startY });
  }, []);

  const handleMouseUp = useCallback(() => { dragging.current = null; }, []);

  const handleNodeClick = useCallback((course) => {
    if (selected?.id === course.id) {
      if (programId) navigate(`/program/${programId}/course/${course.id}`);
    } else {
      setSelected(course);
    }
  }, [selected, navigate, programId]);

  if (loading) return <div className="loading-screen">Building knowledge map…</div>;

  return (
    <div className="app-shell">
      <Sidebar programId={programId} active="knowledge-graph" />
      <div className="main-content" style={{ overflow: 'hidden' }}>
        <TopBar
          crumb="CURRICULUM"
          crumbHref="/dashboard"
          title="Knowledge Map"
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--ink-3)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'oklch(55% 0.14 145)', display: 'inline-block' }} /> Completed
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'oklch(52% 0.14 265)', display: 'inline-block', marginLeft: 8 }} /> Active
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#bbb', display: 'inline-block', marginLeft: 8 }} /> Upcoming
              <button className="btn ghost" style={{ marginLeft: 12 }} onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }}>Reset view</button>
            </div>
          }
        />

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--paper-2)' }}>
          {/* Grid background */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="var(--rule)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Main SVG canvas */}
          <svg
            ref={svgRef}
            style={{ width: '100%', height: '100%', cursor: dragging.current ? 'grabbing' : 'grab' }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="oklch(72% 0.08 265)" opacity={0.7} />
              </marker>
            </defs>

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Semester column headers */}
              {semesters.map(sem => (
                <text
                  key={sem}
                  x={SIDE_PAD + (sem - 1) * COL_W + COL_PAD_X + NODE_W / 2}
                  y={TOP_PAD - 18}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="monospace"
                  fill="var(--ink-3)"
                  letterSpacing="0.1em"
                >
                  SEMESTER {sem}
                </text>
              ))}

              {/* Column dividers */}
              {semesters.slice(1).map(sem => (
                <line
                  key={sem}
                  x1={SIDE_PAD + (sem - 1) * COL_W}
                  y1={TOP_PAD - 40}
                  x2={SIDE_PAD + (sem - 1) * COL_W}
                  y2={svgH}
                  stroke="var(--rule)"
                  strokeWidth={1}
                  strokeDasharray="4 6"
                />
              ))}

              {/* Prerequisite edges */}
              {prereqEdges.map((e, i) => (
                <Edge key={i} source={e.source} target={e.target} positions={positions} />
              ))}

              {/* Course nodes */}
              {courses.map(c => {
                const pos = positions[c.id];
                if (!pos) return null;
                return (
                  <CourseNode
                    key={c.id}
                    course={c}
                    pos={pos}
                    selected={selected?.id === c.id}
                    onClick={handleNodeClick}
                  />
                );
              })}
            </g>
          </svg>

          {/* Detail panel */}
          {selected && (
            <div style={{
              position: 'absolute', right: 16, top: 16, width: 280,
              background: 'var(--paper)', border: '1px solid var(--rule)',
              borderRadius: 14, boxShadow: 'var(--shadow-2)',
              padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--ink-3)', letterSpacing: '0.08em' }}>
                  {selected.code}
                </div>
                <button
                  onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', fontSize: 16, lineHeight: 1, padding: 0 }}
                >×</button>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
                {selected.label}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(() => { const t = courseTypeTag(selected.courseType); return (
                  <span style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 6, background: t.bg, color: t.color, fontWeight: 500 }}>{t.label}</span>
                ); })()}
                <span style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 6, background: 'var(--paper-2)', color: 'var(--ink-3)' }}>
                  {selected.creditHours} credits
                </span>
                <span style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 6, background: statusColor(selected.status).bg, color: statusColor(selected.status).text }}>
                  {selected.status || 'upcoming'}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                Semester {selected.semesterNumber}
              </div>
              <button
                className="btn primary"
                style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
                onClick={() => navigate(`/program/${programId}/course/${selected.id}`)}
              >
                Go to course
              </button>
            </div>
          )}

          {/* Zoom hint */}
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', fontSize: 11, color: 'var(--ink-4)', pointerEvents: 'none' }}>
            Scroll to zoom · drag to pan · click node twice to open course
          </div>
        </div>
      </div>
    </div>
  );
}
