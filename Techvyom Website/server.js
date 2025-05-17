const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { mongoose, initDatabase, Registration, Event, Team, TeamMember, TeamEvent } = require('./db');

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
app.get('/api/search-pids', async (req, res) => {
  const searchTerm = req.query.term || '';
  
  if (searchTerm.length < 2) {
    return res.json([]);
  }
  
  try {
    const results = await Registration.find({
      $or: [
        { pid: { $regex: searchTerm, $options: 'i' } },
        { name: { $regex: searchTerm, $options: 'i' } }
      ]
    }).limit(10).select('pid name');
    
    const formattedResults = results.map(result => ({
      value: result.pid,
      label: `${result.pid}: ${result.name}`
    }));
    
    res.json(formattedResults);
  } catch (err) {
    console.error('Error searching PIDs:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// API endpoint to search for PIDs to add to a team
app.get('/api/search-pids-for-team', async (req, res) => {
  const searchTerm = req.query.term || '';
  const teamId = req.query.teamId;
  
  if (searchTerm.length < 2 || !teamId) {
    return res.json([]);
  }
  
  try {
    // Get current team members
    const currentMembers = await TeamMember.find({ team_id: teamId })
      .populate('registration_id', 'pid');
    
    const currentPids = currentMembers.map(m => m.registration_id.pid);
    
    // Find registrations not in current team
    const query = {
      $or: [
        { pid: { $regex: searchTerm, $options: 'i' } },
        { name: { $regex: searchTerm, $options: 'i' } }
      ]
    };
    
    if (currentPids.length > 0) {
      query.pid = { $nin: currentPids };
    }
    
    const results = await Registration.find(query)
      .limit(10)
      .select('pid name');
    
    const formattedResults = results.map(result => ({
      value: result.pid,
      label: `${result.pid}: ${result.name}`,
      name: result.name
    }));
    
    res.json(formattedResults);
  } catch (err) {
    console.error('Error searching PIDs for team:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Handle registration form submissions
app.post('/register', async (req, res) => {
  const { name, phoneno, rollno, college, course, year } = req.body;
  const selectedEvents = Array.isArray(req.body.events) ? req.body.events : [req.body.events].filter(Boolean);

  try {
    // Check if rollno already exists
    const existing = await Registration.findOne({ rollno });
    if (existing) {
      return res.redirect('/register.html?status=exists');
    }

    // Generate PID
    const lastReg = await Registration.findOne().sort({ _id: -1 });
    const newId = lastReg ? parseInt(lastReg.pid.split('-')[1]) + 1 : 1;
    const pid = `P-${String(newId).padStart(4, '0')}`;

    // Create registration
    const registration = await Registration.create({
      pid, name, phoneno, rollno, college, course, year
    });

    // Add events if any
    if (selectedEvents.length > 0) {
      const events = selectedEvents.map(event_name => ({
        registration_id: registration._id,
        event_name
      }));
      await Event.insertMany(events);
    }

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
  } catch (err) {
    console.error('Registration error:', err);
    res.redirect('/register.html?status=error');
  }
});

// Handle team registration
app.post('/register-team', async (req, res) => {
  const { team_name } = req.body;
  const pids = Array.isArray(req.body.pids) ? req.body.pids : [req.body.pids].filter(Boolean);
  const selectedEvents = Array.isArray(req.body.events) ? req.body.events : [req.body.events].filter(Boolean);

  try {
    // Find registrations for all PIDs
    const registrations = await Registration.find({ pid: { $in: pids } });
    if (registrations.length !== pids.length) {
      return res.redirect('/team-register.html?status=pid_not_found');
    }

    // Generate team ID
    const lastTeam = await Team.findOne().sort({ _id: -1 });
    const newId = lastTeam ? parseInt(lastTeam.team_id.split('-')[1]) + 1 : 1;
    const team_id = `T-${String(newId).padStart(4, '0')}`;

    // Create team
    const team = await Team.create({ team_id, team_name });

    // Add team members
    const teamMembers = registrations.map(reg => ({
      team_id: team._id,
      registration_id: reg._id
    }));
    await TeamMember.insertMany(teamMembers);

    // Add team events if any
    if (selectedEvents.length > 0) {
      const teamEvents = selectedEvents.map(event_name => ({
        team_id: team._id,
        event_name
      }));
      await TeamEvent.insertMany(teamEvents);
    }

    res.render('team-confirmation', {
      team_id,
      team_name,
      members: registrations.map(r => ({
        pid: r.pid,
        name: r.name
      })),
      events: selectedEvents
    });
  } catch (err) {
    console.error('Team registration error:', err);
    res.redirect('/team-register.html?status=error');
  }
});

// Route to display individual registration results from the database
app.get('/results', async (req, res) => {
  const searchQuery = req.query.query || '';
  
  try {
    const results = await Registration.aggregate([
      {
        $match: {
          $or: [
            { name: { $regex: searchQuery, $options: 'i' } },
            { phoneno: { $regex: searchQuery, $options: 'i' } },
            { rollno: { $regex: searchQuery, $options: 'i' } },
            { college: { $regex: searchQuery, $options: 'i' } }
          ]
        }
      },
      {
        $lookup: {
          from: 'events',
          localField: '_id',
          foreignField: 'registration_id',
          as: 'events'
        }
      },
      {
        $addFields: {
          events_list: { $concatArrays: ['$events.event_name'] }
        }
      }
    ]);

    results.forEach(result => {
      result.events = result.events_list || [];
      delete result.events_list;
    });
    
    res.render('results', { results });
  } catch (err) {
    console.error('Search error:', err);
    res.send('Error in search query');
  }
});

// Route to display team registration results from the database
app.get('/team-results', async (req, res) => {
  const searchQuery = req.query.query || '';
  
  try {
    const teams = await Team.find({
      $or: [
        { team_name: { $regex: searchQuery, $options: 'i' } },
        { team_id: { $regex: searchQuery, $options: 'i' } }
      ]
    });

    if (teams.length === 0) {
      return res.render('team-results', { teams: [] });
    }

    const processedTeams = await Promise.all(teams.map(async team => {
      const members = await TeamMember.find({ team_id: team._id })
        .populate('registration_id', 'pid name college');
      
      const events = await TeamEvent.find({ team_id: team._id }, 'event_name');
      
      return {
        ...team.toObject(),
        members: members.map(m => m.registration_id),
        college: members.length > 0 ? members[0].registration_id.college : '',
        events: events.map(e => e.event_name)
      };
    }));

    res.render('team-results', { teams: processedTeams });
  } catch (err) {
    console.error('Team results error:', err);
    res.render('team-results', { 
      error: 'An unexpected error occurred',
      teams: [] 
    });
  }
});

// API endpoint for event lists
app.get('/api/event-lists', async (req, res) => {
  const type = req.query.type || 'individual';
  const events = req.query.event ? (Array.isArray(req.query.event) ? req.query.event : [req.query.event]) : [];
  
  if (events.length === 0) {
    return res.status(400).json({ error: 'No events specified' });
  }

  try {
    if (type === 'team' || type === 'team_event') {
      const results = await TeamEvent.aggregate([
        { $match: { event_name: { $in: events } } },
        {
          $lookup: {
            from: 'teams',
            localField: 'team_id',
            foreignField: '_id',
            as: 'team'
          }
        },
        { $unwind: '$team' },
        {
          $lookup: {
            from: 'teammembers',
            localField: 'team_id',
            foreignField: 'team_id',
            as: 'team_members'
          }
        },
        {
          $lookup: {
            from: 'registrations',
            localField: 'team_members.registration_id',
            foreignField: '_id',
            as: 'members'
          }
        },
        {
          $group: {
            _id: { team_id: '$team._id', event_name: '$event_name' },
            team_id: { $first: '$team.team_id' },
            team_name: { $first: '$team.team_name' },
            college: { $first: { $arrayElemAt: ['$members.college', 0] } },
            members: { $push: '$members' }
          }
        },
        {
          $project: {
            _id: 0,
            team_id: 1,
            team_name: 1,
            college: 1,
            event_name: '$_id.event_name',
            members: {
              $reduce: {
                input: '$members',
                initialValue: [],
                in: { $concatArrays: ['$$value', '$$this'] }
              }
            }
          }
        }
      ]);

      const formattedData = {};
      events.forEach(event => {
        formattedData[event] = results
          .filter(row => row.event_name === event)
          .map(row => ({
            team_id: row.team_id,
            team_name: row.team_name,
            college: row.college,
            members: row.members.map(m => ({
              name: m.name,
              pid: m.pid
            }))
          }));
      });

      res.json(formattedData);
    } else {
      // Individual events
      const results = await Event.aggregate([
        { $match: { event_name: { $in: events } } },
        {
          $lookup: {
            from: 'registrations',
            localField: 'registration_id',
            foreignField: '_id',
            as: 'registration'
          }
        },
        { $unwind: '$registration' },
        {
          $group: {
            _id: '$event_name',
            registrations: {
              $push: {
                pid: '$registration.pid',
                name: '$registration.name',
                college: '$registration.college',
                phoneno: '$registration.phoneno'
              }
            }
          }
        }
      ]);

      const formattedData = {};
      results.forEach(result => {
        formattedData[result._id] = result.registrations;
      });

      // Ensure all requested events are in response
      events.forEach(event => {
        if (!formattedData[event]) {
          formattedData[event] = [];
        }
      });

      res.json(formattedData);
    }
  } catch (err) {
    console.error('Event lists error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// API endpoint to get student details by PID
app.get('/api/student/:pid', async (req, res) => {
  const pid = req.params.pid;

  try {
    const student = await Registration.aggregate([
      { $match: { pid } },
      {
        $lookup: {
          from: 'events',
          localField: '_id',
          foreignField: 'registration_id',
          as: 'individual_events'
        }
      },
      {
        $lookup: {
          from: 'teammembers',
          localField: '_id',
          foreignField: 'registration_id',
          as: 'team_memberships'
        }
      },
      {
        $lookup: {
          from: 'teamevents',
          localField: 'team_memberships.team_id',
          foreignField: 'team_id',
          as: 'team_events'
        }
      },
      {
        $project: {
          pid: 1,
          name: 1,
          phoneno: 1,
          rollno: 1,
          college: 1,
          course: 1,
          year: 1,
          individual_events: '$individual_events.event_name',
          team_events: '$team_events.event_name'
        }
      }
    ]);

    if (student.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const result = student[0];
    const allEvents = [...new Set([...result.individual_events, ...result.team_events])];

    res.json({
      pid: result.pid,
      name: result.name,
      phoneno: result.phoneno,
      rollno: result.rollno,
      college: result.college,
      course: result.course,
      year: result.year,
      events: allEvents
    });
  } catch (err) {
    console.error('Student details error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// API to delete a registration
/// API to delete a registration
app.delete('/api/registration/:id', async (req, res) => {
  const id = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ 
      success: false,
      message: 'Invalid registration ID format' 
    });
  }

  try {
    const result = await Registration.findByIdAndDelete(id);
    
    if (!result) {
      return res.status(404).json({ 
        success: false,
        message: 'Registration not found' 
      });
    }

    // Also delete associated events
    await Event.deleteMany({ registration_id: id });

    res.json({ 
      success: true,
      message: 'Registration deleted successfully' 
    });
  } catch (err) {
    console.error('Delete registration error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Database error',
      error: err.message
    });
  }
});

// API to update a registration
app.put('/api/registration/:id', async (req, res) => {
  const id = req.params.id;
  const { name, phoneno, rollno, college, course, year, events } = req.body;

  try {
    await mongoose.connection.transaction(async session => {
      // Update registration
      await Registration.findByIdAndUpdate(
        id,
        { name, phoneno, rollno, college, course, year },
        { session }
      );

      // Delete existing events
      await Event.deleteMany({ registration_id: id }).session(session);

      // Insert new events if any
      if (events && events.length > 0) {
        const eventsToInsert = events.map(event_name => ({
          registration_id: id,
          event_name
        }));
        await Event.insertMany(eventsToInsert, { session });
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Update registration error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// API to get a single registration
// In server.js
app.get('/api/registration/:id', async (req, res) => {
  const id = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ 
      error: 'Invalid registration ID format' 
    });
  }

  try {
    const registration = await Registration.findById(id);
    
    if (!registration) {
      return res.status(404).json({ 
        error: 'Registration not found' 
      });
    }

    // Get associated events
    const events = await Event.find({ registration_id: id }, 'event_name');
    
    res.json({
      ...registration.toObject(),
      events: events.map(e => e.event_name)
    });
  } catch (err) {
    console.error('Get registration error:', err);
    res.status(500).json({ 
      error: 'Database error',
      details: err.message
    });
  }
});

// Print lists API
app.get('/print-lists', async (req, res) => {
  const listType = req.query.type || 'all';
  const format = req.query.format || 'html';
  const eventName = req.query.event || '';
  const collegeName = req.query.college || '';

  try {
    let results = [];

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
      results = await Event.aggregate([
        { $match: { event_name: eventName } },
        {
          $lookup: {
            from: 'registrations',
            localField: 'registration_id',
            foreignField: '_id',
            as: 'registration'
          }
        },
        { $unwind: '$registration' },
        {
          $project: {
            pid: '$registration.pid',
            name: '$registration.name',
            phoneno: '$registration.phoneno',
            college: '$registration.college',
            course: '$registration.course',
            year: '$registration.year',
            event_name: 1
          }
        }
      ]);
    } else if (listType === 'team_event') {
      results = await TeamEvent.aggregate([
        { $match: { event_name: eventName } },
        {
          $lookup: {
            from: 'teams',
            localField: 'team_id',
            foreignField: '_id',
            as: 'team'
          }
        },
        { $unwind: '$team' },
        {
          $lookup: {
            from: 'teammembers',
            localField: 'team_id',
            foreignField: 'team_id',
            as: 'team_members'
          }
        },
        {
          $lookup: {
            from: 'registrations',
            localField: 'team_members.registration_id',
            foreignField: '_id',
            as: 'members'
          }
        },
        {
          $project: {
            team_id: '$team.team_id',
            team_name: '$team.team_name',
            college: { $arrayElemAt: ['$members.college', 0] },
            event_name: 1,
            members: {
              $map: {
                input: '$members',
                as: 'member',
                in: {
                  name: '$$member.name',
                  pid: '$$member.pid'
                }
              }
            }
          }
        }
      ]);
    } else if (listType === 'college') {
      results = await Registration.aggregate([
        { $match: { college: { $regex: collegeName, $options: 'i' } } },
        {
          $lookup: {
            from: 'events',
            localField: '_id',
            foreignField: 'registration_id',
            as: 'events'
          }
        },
        {
          $project: {
            pid: 1,
            name: 1,
            phoneno: 1,
            college: 1,
            course: 1,
            year: 1,
            events: '$events.event_name'
          }
        }
      ]);
    } else if (listType === 'individual') {
      // Find registrations not in any team
      const teamMembers = await TeamMember.distinct('registration_id');
      
      results = await Registration.aggregate([
        { $match: { _id: { $nin: teamMembers } } },
        {
          $lookup: {
            from: 'events',
            localField: '_id',
            foreignField: 'registration_id',
            as: 'events'
          }
        },
        {
          $project: {
            pid: 1,
            name: 1,
            phoneno: 1,
            college: 1,
            course: 1,
            year: 1,
            events: '$events.event_name'
          }
        }
      ]);
    } else if (listType === 'team') {
      results = await Team.aggregate([
        {
          $lookup: {
            from: 'teammembers',
            localField: '_id',
            foreignField: 'team_id',
            as: 'team_members'
          }
        },
        {
          $lookup: {
            from: 'registrations',
            localField: 'team_members.registration_id',
            foreignField: '_id',
            as: 'members'
          }
        },
        {
          $lookup: {
            from: 'teamevents',
            localField: '_id',
            foreignField: 'team_id',
            as: 'events'
          }
        },
        {
          $project: {
            team_id: 1,
            team_name: 1,
            college: { $arrayElemAt: ['$members.college', 0] },
            members: {
              $map: {
                input: '$members',
                as: 'member',
                in: {
                  name: '$$member.name',
                  pid: '$$member.pid'
                }
              }
            },
            events: '$events.event_name'
          }
        }
      ]);
    } else {
      // All registrations
      results = await Registration.aggregate([
        {
          $lookup: {
            from: 'events',
            localField: '_id',
            foreignField: 'registration_id',
            as: 'events'
          }
        },
        {
          $project: {
            pid: 1,
            name: 1,
            phoneno: 1,
            college: 1,
            course: 1,
            year: 1,
            events: '$events.event_name'
          }
        }
      ]);
    }

    // Handle CSV format
    if (format === 'csv' && results.length > 0) {
      const fields = Object.keys(results[0]);
      let csv = fields.join(',') + '\n';
      
      results.forEach(row => {
        const values = fields.map(field => {
          let value = row[field] || '';
          if (Array.isArray(value)) {
            value = value.join(', ');
          }
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
    }

    res.render('print-lists', { 
      type: listType, 
      data: results,
      event: eventName,
      college: collegeName,
      message: results.length === 0 ? 'No records found matching your criteria.' : null,
      error: null
    });
  } catch (err) {
    console.error('Print lists error:', err);
    res.render('print-lists', { 
      type: 'error', 
      error: 'An unexpected error occurred',
      data: []
    });
  }
});

// API endpoint to list all events
app.get('/api/events', async (req, res) => {
  try {
    const individualEvents = await Event.distinct('event_name');
    const teamEvents = await TeamEvent.distinct('event_name');
    
    res.json({
      individual: individualEvents.sort(),
      team: teamEvents.sort()
    });
  } catch (err) {
    console.error('Events list error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// API route to get a single team
app.get('/api/team/:id', async (req, res) => {
  const id = req.params.id;
  
  try {
    const team = await Team.findById(id);
    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const members = await TeamMember.find({ team_id: team._id })
      .populate('registration_id', 'pid name college');
    
    const events = await TeamEvent.find({ team_id: team._id }, 'event_name');
    
    res.json({
      ...team.toObject(),
      members,
      college: members.length > 0 ? members[0].registration_id.college : '',
      events: events.map(e => e.event_name)
    });
  } catch (err) {
    console.error('Get team error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Route to delete a team
app.delete('/api/team/:id', async (req, res) => {
  const id = req.params.id;
  
  try {
    await mongoose.connection.transaction(async session => {
      // Delete team events
      await TeamEvent.deleteMany({ team_id: id }).session(session);
      
      // Delete team members
      await TeamMember.deleteMany({ team_id: id }).session(session);
      
      // Delete the team
      await Team.findByIdAndDelete(id).session(session);
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Delete team error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Route to update a team
app.put('/api/team/:id', async (req, res) => {
  const id = req.params.id;
  const { team_name, events, member_pids } = req.body;

  if (!team_name) {
    return res.status(400).json({ error: 'Team name is required' });
  }

  if (!Array.isArray(member_pids) || member_pids.length === 0) {
    return res.status(400).json({ error: 'Team must have at least one member' });
  }

  try {
    await mongoose.connection.transaction(async session => {
      // Update team name
      await Team.findByIdAndUpdate(
        id,
        { team_name },
        { session }
      );

      // Get registration IDs for all PIDs
      const registrations = await Registration.find(
        { pid: { $in: member_pids } },
        '_id pid',
        { session }
      );

      if (registrations.length !== member_pids.length) {
        const foundPids = registrations.map(r => r.pid);
        const missingPids = member_pids.filter(pid => !foundPids.includes(pid));
        throw new Error(`Invalid PIDs: ${missingPids.join(', ')}`);
      }

      // Delete existing team members
      await TeamMember.deleteMany({ team_id: id }).session(session);

      // Add new team members
      const teamMembers = registrations.map(reg => ({
        team_id: id,
        registration_id: reg._id
      }));
      await TeamMember.insertMany(teamMembers, { session });

      // Update team events
      await TeamEvent.deleteMany({ team_id: id }).session(session);
      
      if (events && events.length > 0) {
        const teamEvents = events.map(event_name => ({
          team_id: id,
          event_name
        }));
        await TeamEvent.insertMany(teamEvents, { session });
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Update team error:', err);
    res.status(500).json({ error: err.message || 'Database error' });
  }
});

// Registration summary API
app.get('/api/registration-summary', async (req, res) => {
  try {
    const eventCounts = await Event.aggregate([
      { $group: { _id: '$event_name', count: { $sum: 1 } } }
    ]);
    
    const clubCounts = await Event.aggregate([
      {
        $lookup: {
          from: 'registrations',
          localField: 'registration_id',
          foreignField: '_id',
          as: 'registration'
        }
      },
      { $unwind: '$registration' },
      { $group: { _id: '$registration.college', count: { $sum: 1 } } }
    ]);
    
    const total = await Registration.countDocuments();

    const result = {
      eventCounts: {},
      clubCounts: {},
      total
    };

    eventCounts.forEach(item => {
      result.eventCounts[item._id] = item.count;
    });

    clubCounts.forEach(item => {
      result.clubCounts[item._id] = item.count;
    });

    res.json(result);
  } catch (err) {
    console.error('Registration summary error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Event statistics API
app.get('/api/event-statistics', async (req, res) => {
  try {
    const individualCount = await Event.distinct('registration_id').count();
    const teamCount = await TeamEvent.countDocuments();
    
    const teamEvents = await TeamEvent.aggregate([
      { $group: { _id: '$event_name', registrations: { $sum: 1 } } }
    ]);

    res.json({
      individualCount,
      teamCount,
      teamEvents
    });
  } catch (err) {
    console.error('Event statistics error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Find member API
app.get('/api/find-member', async (req, res) => {
  const pid = req.query.pid?.trim();
  if (!pid) return res.status(400).json({ found: false, message: 'PID missing' });

  try {
    const student = await Registration.findOne({ pid }, 'pid name');
    if (student) {
      res.json({ found: true, pid: student.pid, name: student.name });
    } else {
      res.json({ found: false });
    }
  } catch (err) {
    console.error('Find member error:', err);
    res.status(500).json({ found: false, message: 'Database error' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});