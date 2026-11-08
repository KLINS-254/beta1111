{page === "Ad tasks" && (
  <>
    <PageTitle
      title="Partner ad tasks"
      sub="Explore active advertiser campaigns. Rewards are credited only after server-side eligibility checks."
    />

    <div className="task-grid">
      {data.ads.map((ad) => (
        <div className="task-card" key={ad.id}>
          <div className="task-art">
            <PlayCircle size={35} />
            <span>PARTNER CAMPAIGN</span>
          </div>

          <div className="task-body">
            <div className="task-top">
              <b>{ad.title}</b>
              <span className="reward">
                +{money(ad.reward_amount)}
              </span>
            </div>

            <p>
              {ad.description ||
                "Watch the partner content and follow the campaign instructions."}
            </p>

            <div className="task-foot">
              <span>
                <Clock3 size={14} /> {ad.duration_seconds || 15}s view
              </span>

              <button
                className="primary small"
                onClick={() => claimAd(ad)}
              >
                Complete task
              </button>
            </div>
          </div>
        </div>
      ))}

      {!data.ads.length && (
        <Empty text="No active campaigns right now. Check again later." />
      )}
    </div>
  </>
)}
