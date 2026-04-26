import { roadmapMilestones } from '../content/roadmapData'

const statusLabel: Record<string, string> = {
  completed: 'Completed',
  incoming: 'Incoming',
  scheduled: 'Scheduled',
  planned: 'Planned',
  future: 'Future Front'
}

export default function RoadmapBattlefield() {
  return (
    <section className="roadmap-battlefield mb-8" aria-label="MemeWarzone battlefield roadmap">
      <div className="roadmap-battlefield__scan" aria-hidden="true" />

      <div className="roadmap-battlefield__header">
        <div>
          <p className="roadmap-battlefield__eyebrow">Battlefield campaign map</p>
          <h2>From first war plan to launchpad domination</h2>
          <p>
            Scroll left to right through the MemeWarzone campaign route. Every checkpoint marks a real milestone.
          </p>
        </div>
        <div className="roadmap-battlefield__hint" aria-hidden="true">
          Scroll →
        </div>
      </div>

      <div className="roadmap-scroll" role="region" tabIndex={0}>
        <div className="roadmap-track">
          <div className="roadmap-route-line" aria-hidden="true" />

          {roadmapMilestones.map((m, i) => (
            <a
              key={m.id}
              href={`#${m.id}`}
              className={`roadmap-node roadmap-node--${m.status}`}
              style={{ ['--i' as any]: i }}
            >
              <span className="roadmap-beacon" />
              <span className="roadmap-month">{m.month}</span>
              <strong className="roadmap-title">{m.title}</strong>
              <p className="roadmap-text">{m.shortText}</p>
              <span className="roadmap-status">{statusLabel[m.status]}</span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
