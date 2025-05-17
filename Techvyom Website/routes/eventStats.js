// Add this API route to server.js (or in routes/statistics.js if modular)

app.get('/api/event-statistics', (req, res) => {
  const stats = {
    individualCount: 0,
    teamCount: 0,
    teamEvents: []
  };

  const individualQuery = 'SELECT COUNT(DISTINCT registration_id) AS count FROM events';
  const teamCountQuery = 'SELECT COUNT(*) AS count FROM team_events';
  const teamEventTableQuery = `
    SELECT event_name, COUNT(*) AS registrations
    FROM team_events
    GROUP BY event_name
  `;

  connection.query(individualQuery, (err, indResult) => {
    if (err) return res.status(500).json({ error: 'Failed to get individual count' });
    stats.individualCount = indResult[0].count;

    connection.query(teamCountQuery, (err, teamCountResult) => {
      if (err) return res.status(500).json({ error: 'Failed to get team count' });
      stats.teamCount = teamCountResult[0].count;

      connection.query(teamEventTableQuery, (err, teamEventsResult) => {
        if (err) return res.status(500).json({ error: 'Failed to get team event table' });
        stats.teamEvents = teamEventsResult;
        res.json(stats);
      });
    });
  });
});
