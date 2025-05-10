const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { connection, initDatabase } = require('./db');

const app = express();
const PORT = 3011;

// Initialize the database connection
initDatabase();

// Middleware setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve the home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Serve the db-login page
app.get('/db-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'db-login.html'));
});

// API endpoint for PID autocomplete
app.get('/api/search-pids', (req, res) => {
  const searchTerm = req.query.term || '';
  
  if (searchTerm.length < 2) {
    return res.json([]);
  }
  
  const query = `
    SELECT pid, name 
    FROM registrations 
    WHERE pid LIKE ? OR name LIKE ? 
    LIMIT 10
  `;
  
  connection.query(query, [`%${searchTerm}%`, `%${searchTerm}%`], (err, results) => {
    if (err) {
      console.error('Error searching PIDs:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    const formattedResults = results.map(result => ({
      value: result.pid,
      label: `${result.pid}: ${result.name}`
    }));
    
    res.json(formattedResults);
  });
});

// API endpoint to search for PIDs to add to a team
app.get('/api/search-pids-for-team', (req, res) => {
  const searchTerm = req.query.term || '';
  const teamId = req.query.teamId;
  
  if (searchTerm.length < 2 || !teamId) {
    return res.json([]);
  }
  
  const getTeamMembersQuery = `
    SELECT r.pid 
    FROM registrations r 
    JOIN team_members tm ON r.id = tm.registration_id 
    WHERE tm.team_id = ?
  `;
  
  connection.query(getTeamMembersQuery, [teamId], (err, currentMembers) => {
    if (err) {
      console.error('Error getting team members:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    const currentPids = currentMembers.map(m => m.pid);
    
    let query = `
      SELECT pid, name 
      FROM registrations 
      WHERE (pid LIKE ? OR name LIKE ?)
    `;
    
    let params = [`%${searchTerm}%`, `%${searchTerm}%`];
    
    if (currentPids.length > 0) {
      const placeholders = currentPids.map(() => '?').join(',');
      query += ` AND pid NOT IN (${placeholders})`;
      params = params.concat(currentPids);
    }
    
    query += ' LIMIT 10';
    
    connection.query(query, params, (err, results) => {
      if (err) {
        console.error('Error searching PIDs for team:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      const formattedResults = results.map(result => ({
        value: result.pid,
        label: `${result.pid}: ${result.name}`,
        name: result.name
      }));
      
      res.json(formattedResults);
    });
  });
});

// Handle registration form submissions
app.post('/register', (req, res) => {
  const { name, phoneno, rollno, college, course, year } = req.body;
  const selectedEvents = Array.isArray(req.body.events) ? req.body.events : [req.body.events].filter(Boolean);

  const checkQuery = `SELECT * FROM registrations WHERE rollno = ? `;
  connection.query(checkQuery, [rollno], (err, results) => {
    if (err) return res.redirect('/register.html?status=error');
    if (results.length > 0) return res.redirect('/register.html?status=exists');

    const getLastIdQuery = `SELECT id FROM registrations ORDER BY id DESC LIMIT 1`;
    connection.query(getLastIdQuery, (err, result) => {
      if (err) return res.redirect('/register.html?status=error');

      const lastId = result.length > 0 ? result[0].id : 0;
      const newId = lastId + 1;
      const pid = `P-${String(newId).padStart(4, '0')}`;

      const insertQuery = `
        INSERT INTO registrations (pid, name, phoneno ,rollno, college, course, year)
        VALUES ( ?, ?, ?, ?, ?, ?, ?)`;

      connection.query(
        insertQuery,
        [pid, name, phoneno,  rollno, college, course, year],
        (err, result) => {
          if (err) return res.redirect('/register.html?status=error');
          
          if (selectedEvents && selectedEvents.length > 0) {
            const registrationId = result.insertId;
            const eventValues = selectedEvents.map(event => [registrationId, event]);
            
            const insertEventsQuery = `INSERT INTO events (registration_id, event_name) VALUES ?`;
            connection.query(insertEventsQuery, [eventValues], (err) => {
              if (err) return res.redirect('/register.html?status=error');
              
              res.render('confirmation', {
                pid,
                name,
                phoneno,
                
                rollno,
                
                college,
                course,
                year,
                events: selectedEvents
              });
            });
          } else {
            res.render('confirmation', {
              pid,
              name,
              phoneno,
             
              rollno,
             
              college,
              course,
              year,
              events: []
            });
          }
        }
      );
    });
  });
});

// Handle team registration
app.post('/register-team', (req, res) => {
  const { team_name } = req.body;
  const pids = Array.isArray(req.body.pids) ? req.body.pids : [req.body.pids].filter(Boolean);
  const selectedEvents = Array.isArray(req.body.events) ? req.body.events : [req.body.events].filter(Boolean);
  
  const findRegistrationsQuery = 'SELECT id, pid, name FROM registrations WHERE pid IN (?)';
  connection.query(findRegistrationsQuery, [pids], (err, registrations) => {
    if (err) return res.redirect('/team-register.html?status=error');
    
    if (registrations.length !== pids.length) {
      return res.redirect('/team-register.html?status=pid_not_found');
    }
    
    const getLastTeamIdQuery = `SELECT id FROM teams ORDER BY id DESC LIMIT 1`;
    connection.query(getLastTeamIdQuery, (err, result) => {
      if (err) return res.redirect('/team-register.html?status=error');

      const lastId = result.length > 0 ? result[0].id : 0;
      const newId = lastId + 1;
      const team_id = `T-${String(newId).padStart(4, '0')}`;
      
      const insertTeamQuery = 'INSERT INTO teams (team_id, team_name) VALUES (?, ?)';
      connection.query(insertTeamQuery, [team_id, team_name], (err, teamResult) => {
        if (err) return res.redirect('/team-register.html?status=error');
        
        const teamId = teamResult.insertId;
        
        const teamMembers = registrations.map(reg => [teamId, reg.id]);
        const insertTeamMembersQuery = 'INSERT INTO team_members (team_id, registration_id) VALUES ?';
        
        connection.query(insertTeamMembersQuery, [teamMembers], (err) => {
          if (err) return res.redirect('/team-register.html?status=error');
          
          if (selectedEvents && selectedEvents.length > 0) {
            const teamEvents = selectedEvents.map(event => [teamId, event]);
            const insertTeamEventsQuery = 'INSERT INTO team_events (team_id, event_name) VALUES ?';
            
            connection.query(insertTeamEventsQuery, [teamEvents], (err) => {
              if (err) return res.redirect('/team-register.html?status=error');
              
              res.render('team-confirmation', {
                team_id,
                team_name,
                members: registrations.map(r => ({
                  pid: r.pid,
                  name: r.name
                })),
                events: selectedEvents
              });
            });
          } else {
            res.render('team-confirmation', {
              team_id,
              team_name,
              members: registrations.map(r => ({
                pid: r.pid,
                name: r.name
              })),
              events: []
            });
          }
        });
      });
    });
  });
});

// Route to display individual registration results from the database
app.get('/results', (req, res) => {
  const searchQuery = req.query.query || '';
  const searchSQL = `
    SELECT r.*, GROUP_CONCAT(e.event_name SEPARATOR ', ') as events_list
    FROM registrations r
    LEFT JOIN events e ON r.id = e.registration_id
    WHERE r.name LIKE ? OR r.phoneno LIKE ?  OR r.rollno LIKE ? OR r.college LIKE ?
    GROUP BY r.id`;

  connection.query(searchSQL, [
    `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`
  ], (err, results) => {
    if (err) return res.send('Error in search query');
    
    results.forEach(result => {
      result.events = result.events_list ? result.events_list.split(', ') : [];
      delete result.events_list;
    });
    
    res.render('results', { results });
  });
});

// Route to display team registration results from the database
app.get('/team-results', (req, res) => {
  const searchQuery = req.query.query || '';
  
  try {
    const getTeamsQuery = `
      SELECT t.id, t.team_id, t.team_name
      FROM teams t
      WHERE t.team_name LIKE ? OR t.team_id LIKE ?
    `;
    
    connection.query(getTeamsQuery, [`%${searchQuery}%`, `%${searchQuery}%`], (err, teams) => {
      if (err) {
        console.error('Error retrieving teams:', err);
        return res.render('team-results', { 
          error: 'Error retrieving teams',
          teams: [] 
        });
      }
      
      if (teams.length === 0) {
        return res.render('team-results', { teams: [] });
      }
      
      const processedTeams = [];
      let completedTeams = 0;
      
      teams.forEach(team => {
        const getMembersQuery = `
          SELECT r.pid, r.name, r.college
          FROM registrations r
          JOIN team_members tm ON r.id = tm.registration_id
          WHERE tm.team_id = ?
        `;
        
        connection.query(getMembersQuery, [team.id], (memberErr, members) => {
          if (memberErr) {
            console.error('Error retrieving team members:', memberErr);
            team.members = [];
          } else {
            team.members = members;
            // Take the college from the first member (assuming all members are from same college)
            team.college = members.length > 0 ? members[0].college : '';
          }
          
          const getEventsQuery = `
            SELECT event_name
            FROM team_events
            WHERE team_id = ?
          `;
          
          connection.query(getEventsQuery, [team.id], (eventErr, events) => {
            if (eventErr) {
              console.error('Error retrieving team events:', eventErr);
              team.events = [];
            } else {
              team.events = events.map(e => e.event_name);
            }
            
            processedTeams.push(team);
            completedTeams++;
            
            if (completedTeams === teams.length) {
              res.render('team-results', { teams: processedTeams });
            }
          });
        });
      });
    });
  } catch (error) {
    console.error('Unexpected error in team-results route:', error);
    res.render('team-results', { 
      error: 'An unexpected error occurred',
      teams: [] 
    });
  }
});

// API endpoint for event lists
app.get('/api/event-lists', (req, res) => {
  const type = req.query.type || 'individual';
  const events = req.query.event ? (Array.isArray(req.query.event) ? req.query.event : [req.query.event]) : [];
  
  if (events.length === 0) {
    return res.status(400).json({ error: 'No events specified' });
  }

  if (type === 'team' || type === 'team_event') {
    const placeholders = events.map(() => '?').join(', ');
    const query = `
  SELECT t.team_id, t.team_name, te.event_name,
         GROUP_CONCAT(DISTINCT CONCAT(r.name, ' (', r.pid, ')') SEPARATOR ', ') as members,
         MAX(r.college) as college
  FROM teams t
  JOIN team_events te ON t.id = te.team_id
  JOIN team_members tm ON t.id = tm.team_id
  JOIN registrations r ON tm.registration_id = r.id
  WHERE te.event_name IN (${placeholders})
  GROUP BY t.id, te.event_name
  ORDER BY t.team_name
`;

  
    connection.query(query, events, (err, results) => {
      if (err) {
        console.error('❌ MySQL Error in /api/event-lists:', err.message);
        console.error('Query:', query);
        console.error('Events passed:', events);
        return res.status(500).json({ error: 'Database error', details: err.message });
      }
    
  
      const formattedData = {};
      events.forEach(event => {
        formattedData[event] = results
          .filter(row => row.event_name === event)
          .map(row => ({
            team_id: row.team_id,
            team_name: row.team_name,
            college: row.college,
            members: row.members
              ? row.members.split(', ').map(m => {
                  const match = m.match(/(.*)\((.*)\)/);
                  return match
                    ? { name: match[1].trim(), pid: match[2].trim() }
                    : { name: m.trim(), pid: '' };
                })
              : []
          }));
      });
  
      res.json(formattedData);
    });
  }
  
  else {
    // Query for individual events
    const query = `
      SELECT r.pid, r.name, r.college, r.phoneno, e.event_name
      FROM registrations r
      JOIN events e ON r.id = e.registration_id
      WHERE e.event_name IN (?)
      ORDER BY r.name
    `;
    
    connection.query(query, [events], (err, results) => {
      if (err) {
        console.error('Error fetching individual event lists:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      // Format the data for the frontend
      const formattedData = {};
      events.forEach(event => {
        formattedData[event] = results.filter(row => row.event_name === event).map(row => ({
          pid: row.pid,
          name: row.name,
          college: row.college,
          phoneno: row.phoneno
        }));
      });
      
      res.json(formattedData);
    });
  }
});

// API endpoint to get student details by PID
app.get('/api/student/:pid', (req, res) => {
  const pid = req.params.pid;

  const query = `
    SELECT r.id, r.pid, r.name, r.phoneno,  r.rollno, r.college, r.course, r.year,
           GROUP_CONCAT(DISTINCT e.event_name) as individual_events,
           GROUP_CONCAT(DISTINCT te.event_name) as team_events
    FROM registrations r
    LEFT JOIN events e ON r.id = e.registration_id
    LEFT JOIN team_members tm ON r.id = tm.registration_id
    LEFT JOIN team_events te ON tm.team_id = te.team_id
    WHERE r.pid = ?
    GROUP BY r.id
  `;

  connection.query(query, [pid], (err, results) => {
    if (err) {
      console.error('Error fetching student:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = results[0];
    
    // Combine individual and team events
    const individualEvents = student.individual_events ? student.individual_events.split(',') : [];
    const teamEvents = student.team_events ? student.team_events.split(',') : [];
    const allEvents = [...new Set([...individualEvents, ...teamEvents])];

    const response = {
      pid: student.pid,
      name: student.name,
      phoneno: student.phoneno,
      
      rollno: student.rollno,
      
      college: student.college,
      course: student.course,
      year: student.year,
      events: allEvents
    };

    res.json(response);
  });
});

// Alias to delete a registration (used by frontend edit modal)
app.delete('/api/registration/:id', (req, res) => {
  const id = req.params.id;

  connection.beginTransaction((err) => {
    if (err) {
      console.error('Error starting transaction:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    const deleteTeamMembershipsQuery = `DELETE FROM team_members WHERE registration_id = ?`;
    connection.query(deleteTeamMembershipsQuery, [id], (err) => {
      if (err) {
        console.error('Error deleting team memberships:', err);
        return connection.rollback(() => res.status(500).json({ error: 'Database error' }));
      }

      const deleteEventsQuery = `DELETE FROM events WHERE registration_id = ?`;
    connection.query(deleteEventsQuery, [id], (err) => {
      if (err) {
        console.error('Error deleting events:', err);
        return connection.rollback(() => res.status(500).json({ error: 'Database error' }));
      }

      const deleteRegistrationQuery = `DELETE FROM registrations WHERE id = ?`;
      connection.query(deleteRegistrationQuery, [id], (err) => {
        if (err) {
          console.error('Error deleting registration:', err);
          return connection.rollback(() => res.status(500).json({ error: 'Database error' }));
        }

        connection.commit((err) => {
          if (err) {
            console.error('Error committing transaction:', err);
            return connection.rollback(() => res.status(500).json({ error: 'Database error' }));
          }

          res.json({ success: true });
        });
      });
    });
  });
});
});

// API route to update a registration (used by frontend edit modal)
app.put('/api/registration/:id', (req, res) => {
  const id = req.params.id;
  const { name, phoneno,  rollno,  college, course, year, events } = req.body;

  connection.beginTransaction((err) => {
    if (err) {
      console.error('Error starting transaction:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    const updateQuery = `
      UPDATE registrations 
      SET name = ?, phoneno = ?, rollno = ?, college = ?, course = ?, year = ?
      WHERE id = ?`;

    connection.query(
      updateQuery,
      [name, phoneno,  rollno, college, course, year, id],
      (err) => {
        if (err) {
          console.error('Error updating registration:', err);
          return connection.rollback(() => res.status(500).json({ error: 'Database error' }));
        }

        // First delete existing events
        const deleteEventsQuery = `DELETE FROM events WHERE registration_id = ?`;
        connection.query(deleteEventsQuery, [id], (err) => {
          if (err) {
            console.error('Error deleting existing events:', err);
            return connection.rollback(() => res.status(500).json({ error: 'Database error' }));
          }

          // If we have events, insert them
          if (events && events.length > 0) {
            const eventValues = events.map(event => [id, event]);
            const insertEventsQuery = `INSERT INTO events (registration_id, event_name) VALUES ?`;
            
            connection.query(insertEventsQuery, [eventValues], (err) => {
              if (err) {
                console.error('Error inserting updated events:', err);
                return connection.rollback(() => res.status(500).json({ error: 'Database error' }));
              }
              
              connection.commit((err) => {
                if (err) {
                  console.error('Error committing transaction:', err);
                  return connection.rollback(() => res.status(500).json({ error: 'Database error' }));
                }
                
                res.json({ success: true });
              });
            });
          } else {
            // No events to insert, just commit
            connection.commit((err) => {
              if (err) {
                console.error('Error committing transaction:', err);
                return connection.rollback(() => res.status(500).json({ error: 'Database error' }));
              }
              
              res.json({ success: true });
            });
          }
        });
      }
    );
  });
});

// API route to get a single registration
app.get('/api/registration/:id', (req, res) => {
  const id = req.params.id;
  
  const query = `
    SELECT r.*, GROUP_CONCAT(e.event_name) as events_list
    FROM registrations r
    LEFT JOIN events e ON r.id = e.registration_id
    WHERE r.id = ?
    GROUP BY r.id
  `;
  
  connection.query(query, [id], (err, results) => {
    if (err) {
      console.error('Error fetching registration:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }
    
    const result = results[0];
    result.events = result.events_list ? result.events_list.split(',') : [];
    delete result.events_list;
    
    res.json(result);
  });
});

// Updated Print list API with better team event handling
app.get('/print-lists', (req, res) => {
  const listType = req.query.type || 'all';
  const format = req.query.format || 'html';
  const eventName = req.query.event || '';
  const collegeName = req.query.college || '';
  
  console.log(`Printing list: type=${listType}, format=${format}, event=${eventName}, college=${collegeName}`);
  
  try {
    let query;
    let params = [];
    
    if ((listType === 'event' || listType === 'team_event') && !eventName) {
      return res.render('print-lists', { 
        type: listType, 
        error: 'Event name is required',
        data: []
      });
    }
    
    if (listType === 'college' && !collegeName) {
      return res.render('print-lists', { 
        type: 'error', 
        error: 'College name is required',
        data: []
      });
    }
    
    if (listType === 'event') {
      query = `
        SELECT r.pid, r.name, r.phoneno, r.college, r.course, r.year
        FROM registrations r
        JOIN events e ON r.id = e.registration_id
        WHERE e.event_name = ?
        ORDER BY r.name
      `;
      params = [eventName];
      
    } else if (listType === 'team_event') {
      query = `
        SELECT 
          t.team_id, 
          t.team_name, 
          GROUP_CONCAT(CONCAT(r.name, ' (', r.pid, ')')) AS members,
          r.college as college,
          te.event_name
        FROM teams t
        JOIN team_events te ON t.id = te.team_id
        JOIN team_members tm ON t.id = tm.team_id
        JOIN registrations r ON tm.registration_id = r.id
        WHERE te.event_name = ?
        GROUP BY t.id, te.event_name
        ORDER BY t.team_name
      `;
      params = [eventName];
      
    } else if (listType === 'college') {
      query = `
        SELECT r.pid, r.name, r.phoneno, r.course, r.year, 
               GROUP_CONCAT(e.event_name SEPARATOR ', ') as events
        FROM registrations r
        LEFT JOIN events e ON r.id = e.registration_id
        WHERE r.college LIKE ?
        GROUP BY r.id
        ORDER BY r.name
      `;
      params = [`%${collegeName}%`];
      
    } else if (listType === 'individual') {
      query = `
        SELECT r.pid, r.name, r.phoneno, r.college, r.course, r.year, 
               GROUP_CONCAT(e.event_name SEPARATOR ', ') as events
        FROM registrations r
        LEFT JOIN events e ON r.id = e.registration_id
        WHERE r.id NOT IN (
          SELECT tm.registration_id FROM team_members tm
        )
        GROUP BY r.id
        ORDER BY r.name
      `;
    } else if (listType === 'team') {
      query = `
        SELECT 
          t.team_id, 
          t.team_name, 
          GROUP_CONCAT(DISTINCT CONCAT(r.name, ' (', r.pid, ')') SEPARATOR ', ') as members,
          r.college as college,
          GROUP_CONCAT(DISTINCT te.event_name SEPARATOR ', ') as events
        FROM teams t
        LEFT JOIN team_events te ON t.id = te.team_id
        LEFT JOIN team_members tm ON t.id = tm.team_id
        LEFT JOIN registrations r ON tm.registration_id = r.id
        GROUP BY t.id
        ORDER BY t.team_name
      `;
    } else {
      query = `
        SELECT r.pid, r.name, r.phoneno, r.college, r.course, r.year, 
               GROUP_CONCAT(e.event_name SEPARATOR ', ') as events
        FROM registrations r
        LEFT JOIN events e ON r.id = e.registration_id
        GROUP BY r.id
        ORDER BY r.name
      `;
    }
    
    console.log("SQL Query:", query);
    console.log("Params:", params);
    
    connection.query(query, params, (err, results) => {
      if (err) {
        console.error('Error retrieving data for print:', err);
        return res.render('print-lists', { 
          type: 'error', 
          error: 'Database error: ' + err.message,
          data: []
        });
      }
      
      console.log(`Query returned ${results ? results.length : 0} results`);
      
      // Format team members data for the template
      if (listType === 'team' || listType === 'team_event') {
        results = results.map(row => {
          if (row.members) {
            row.members = row.members.split(', ').map(member => {
              const match = member.match(/(.*)\((.*)\)/);
              return match ? { name: match[1].trim(), pid: match[2].trim() } : { name: member.trim(), pid: '' };
            });
          } else {
            row.members = [];
          }
          return row;
        });
      }
      
      // Handle CSV format
      if (format === 'csv' && results && results.length > 0) {
        const fields = Object.keys(results[0]);
        let csv = fields.join(',') + '\n';
        
        results.forEach(row => {
          const values = fields.map(field => {
            let value = row[field] || '';
            // Handle array data (like members)
            if (Array.isArray(value)) {
              value = value.map(item => {
                if (typeof item === 'object') {
                  return `${item.name} (${item.pid})`;
                }
                return item;
              }).join(', ');
            }
            // Escape quotes and wrap in quotes if contains comma
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              value = '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
          });
          csv += values.join(',') + '\n';
        });
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${listType}_list.csv`);
        return res.send(csv);
      } else {
        if (!results || results.length === 0) {
          console.log(`No results found for query`);
          return res.render('print-lists', {
            type: listType,
            data: [],
            event: eventName,
            college: collegeName,
            message: 'No records found matching your criteria.'
          });
        }
        
        console.log(`Sample data (first record):`, JSON.stringify(results[0]));
        console.log(`Rendering print-lists with ${results.length} results`);
        
        return res.render('print-lists', { 
          type: listType, 
          data: results,
          event: eventName,
          college: collegeName,
          message: null,
          error: null
        });
      }
    });
  } catch (error) {
    console.error('Unexpected error in print-lists route:', error);
    return res.render('print-lists', { 
      type: 'error', 
      error: 'An unexpected error occurred: ' + error.message,
      data: []
    });
  }
});

// API endpoint to list all events
app.get('/api/events', (req, res) => {
  // Get individual events
  const individualEventsQuery = `
    SELECT DISTINCT event_name FROM events ORDER BY event_name
  `;
  
  // Get team events
  const teamEventsQuery = `
    SELECT DISTINCT event_name FROM team_events ORDER BY event_name
  `;
  
  connection.query(individualEventsQuery, (err, individualEvents) => {
    if (err) {
      console.error('Error retrieving individual events:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    connection.query(teamEventsQuery, (err, teamEvents) => {
      if (err) {
        console.error('Error retrieving team events:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      const events = {
        individual: individualEvents.map(e => e.event_name),
        team: teamEvents.map(e => e.event_name)
      };
      
      res.json(events);
    });
  });
});

// API route to get a single team
app.get('/api/team/:id', (req, res) => {
  const id = req.params.id;
  
  const getTeamQuery = `
    SELECT t.id, t.team_id, t.team_name
    FROM teams t
    WHERE t.id = ?
  `;
  
  connection.query(getTeamQuery, [id], (err, teams) => {
    if (err) {
      console.error('Error retrieving team:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (teams.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    const team = teams[0];
    
    const getMembersQuery = `
      SELECT r.id, r.pid, r.name, r.college
      FROM registrations r
      JOIN team_members tm ON r.id = tm.registration_id
      WHERE tm.team_id = ?
    `;
    
    connection.query(getMembersQuery, [id], (err, members) => {
      if (err) {
        console.error('Error retrieving team members:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      team.members = members;
      team.college = members.length > 0 ? members[0].college : '';
      
      const getEventsQuery = `
        SELECT event_name
        FROM team_events
        WHERE team_id = ?
      `;
      
      connection.query(getEventsQuery, [id], (err, events) => {
        if (err) {
          console.error('Error retrieving team events:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        
        team.events = events.map(e => e.event_name);
        
        res.json(team);
      });
    });
  });
});

// Route to delete a team (using standard RESTful API conventions)
app.delete('/api/team/:id', (req, res) => {
  const id = req.params.id;
  
  connection.beginTransaction((err) => {
    if (err) {
      console.error('Error starting transaction:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    // First delete team events
    const deleteTeamEventsQuery = `DELETE FROM team_events WHERE team_id = ?`;
    connection.query(deleteTeamEventsQuery, [id], (err) => {
      if (err) {
        console.error('Error deleting team events:', err);
        return connection.rollback(() => {
          res.status(500).json({ error: 'Database error' });
        });
      }
      
      // Then delete team members
      const deleteTeamMembersQuery = `DELETE FROM team_members WHERE team_id = ?`;
      connection.query(deleteTeamMembersQuery, [id], (err) => {
        if (err) {
          console.error('Error deleting team members:', err);
          return connection.rollback(() => {
            res.status(500).json({ error: 'Database error' });
          });
        }
        
        // Finally delete the team
        const deleteTeamQuery = `DELETE FROM teams WHERE id = ?`;
        connection.query(deleteTeamQuery, [id], (err) => {
          if (err) {
            console.error('Error deleting team:', err);
            return connection.rollback(() => {
              res.status(500).json({ error: 'Database error' });
            });
          }
          
          connection.commit((err) => {
            if (err) {
              console.error('Error committing transaction:', err);
              return connection.rollback(() => {
                res.status(500).json({ error: 'Database error' });
              });
            }
            
            res.json({ success: true });
          });
        });
      });
    });
  });
});

// Route to update a team (using standard RESTful API conventions)
app.put('/api/team/:id', (req, res) => {
  const id = req.params.id;
  const { team_name, events, member_pids } = req.body;

  if (!team_name) {
    return res.status(400).json({ error: 'Team name is required' });
  }

  connection.beginTransaction(async (err) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    // Step 1: Update team name
    const updateTeamQuery = `UPDATE teams SET team_name = ? WHERE id = ?`;
    connection.query(updateTeamQuery, [team_name, id], (err) => {
      if (err) return connection.rollback(() => res.status(500).json({ error: 'Database error updating team name' }));

      // Step 2: Update team events
      const deleteEventsQuery = `DELETE FROM team_events WHERE team_id = ?`;
      connection.query(deleteEventsQuery, [id], (err) => {
        if (err) return connection.rollback(() => res.status(500).json({ error: 'Error deleting team events' }));

        const insertEventsQuery = `INSERT INTO team_events (team_id, event_name) VALUES ?`;
        const eventValues = (events || []).map(event => [id, event]);

        const insertEvents = (callback) => {
          if (eventValues.length === 0) return callback();
          connection.query(insertEventsQuery, [eventValues], (err) => {
            if (err) return callback(err);
            callback();
          });
        };

        // Step 3: Update team members
        const deleteMembersQuery = `DELETE FROM team_members WHERE team_id = ?`;
        connection.query(deleteMembersQuery, [id], (err) => {
          if (err) return connection.rollback(() => res.status(500).json({ error: 'Error deleting team members' }));

          if (!Array.isArray(member_pids) || member_pids.length === 0) {
            return connection.rollback(() => res.status(400).json({ error: 'Team must have at least one member' }));
          }

          const getIdsQuery = `SELECT id, pid FROM registrations WHERE pid IN (?)`;
          connection.query(getIdsQuery, [member_pids], (err, results) => {
            if (err) return connection.rollback(() => res.status(500).json({ error: 'Error resolving member PIDs' }));

            const regIdMap = new Map(results.map(r => [r.pid, r.id]));
            const missingPIDs = member_pids.filter(pid => !regIdMap.has(pid));
            if (missingPIDs.length > 0) {
              return connection.rollback(() => res.status(400).json({ error: `Invalid PIDs: ${missingPIDs.join(', ')}` }));
            }

            const memberValues = member_pids.map(pid => [id, regIdMap.get(pid)]);
            const insertMembersQuery = `INSERT INTO team_members (team_id, registration_id) VALUES ?`;

            connection.query(insertMembersQuery, [memberValues], (err) => {
              if (err) return connection.rollback(() => res.status(500).json({ error: 'Error inserting team members' }));

              // Step 4: Insert events and commit
              insertEvents((err) => {
                if (err) return connection.rollback(() => res.status(500).json({ error: 'Error inserting team events' }));

                connection.commit((err) => {
                  if (err) return connection.rollback(() => res.status(500).json({ error: 'Error committing transaction' }));
                  res.json({ success: true });
                });
              });
            });
          });
        });
      });
    });
  });
});







app.get('/api/registration-summary', (req, res) => {
  const eventQuery = `
    SELECT event_name, COUNT(*) AS count
    FROM events
    GROUP BY event_name
  `;
  const clubQuery = `
    SELECT college AS club, COUNT(DISTINCT r.id) AS count
    FROM registrations r
    JOIN events e ON r.id = e.registration_id
    GROUP BY college
  `;
  const totalQuery = `
    SELECT COUNT(*) AS total
    FROM registrations
  `;

  const results = { eventCounts: {}, clubCounts: {}, total: 0 };

  connection.query(eventQuery, (err, eventRes) => {
    if (err) return res.status(500).json({ error: 'Error fetching event counts' });
    eventRes.forEach(row => results.eventCounts[row.event_name] = row.count);

    connection.query(clubQuery, (err, clubRes) => {
      if (err) return res.status(500).json({ error: 'Error fetching club counts' });
      clubRes.forEach(row => results.clubCounts[row.club] = row.count);

      connection.query(totalQuery, (err, totalRes) => {
        if (err) return res.status(500).json({ error: 'Error fetching total count' });
        results.total = totalRes[0].total;
        res.json(results);
      });
    });
  });
});








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
    if (err) {
      console.error('Error fetching individual count:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    stats.individualCount = indResult[0].count;

    connection.query(teamCountQuery, (err, teamCountResult) => {
      if (err) {
        console.error('Error fetching team count:', err);
        return res.status(500).json({ error: 'Database error' });
      }

      stats.teamCount = teamCountResult[0].count;

      connection.query(teamEventTableQuery, (err, teamEventsResult) => {
        if (err) {
          console.error('Error fetching team events:', err);
          return res.status(500).json({ error: 'Database error' });
        }

        stats.teamEvents = teamEventsResult;
        res.json(stats);
      });
    });
  });
});


app.get('/api/find-member', (req, res) => {
  const pid = req.query.pid?.trim();
  if (!pid) return res.status(400).json({ found: false, message: 'PID missing' });

  const sql = 'SELECT id, name, pid FROM registrations WHERE pid = ?';
  connection.query(sql, [pid], (err, results) => {
    if (err) {
      console.error('Error in /api/find-member:', err);
      return res.status(500).json({ found: false, message: 'Database error' });
    }

    if (results.length > 0) {
      const { pid, name } = results[0];
      res.json({ found: true, pid, name });
    } else {
      res.json({ found: false });
    }
  });
});



// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});