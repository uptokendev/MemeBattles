import { roadmapMilestones } from '../content/roadmapData'

export default function RoadmapBattlefield() {
  return (
    <section className="mb-panel rounded-[1.9rem] p-6 mb-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Battlefield Roadmap</h2>
        <p className="text-mb-muted">Scroll through the MemeWarzone campaign from first idea to full domination.</p>
      </div>

      <div className="roadmap-scroll">
        <div className="roadmap-track">
          {roadmapMilestones.map((m) => (
            <div key={m.id} className={`roadmap-node roadmap-node--${m.status}`}>
              <span className="roadmap-month">{m.month}</span>
              <strong className="roadmap-title">{m.title}</strong>
              <p className="roadmap-text">{m.shortText}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
