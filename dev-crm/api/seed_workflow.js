const mongoose = require('mongoose');

const uri = 'mongodb://localhost:27017/mathionix-crm';

const workflowSchema = new mongoose.Schema({
  name: String,
  description: String,
  trigger: String,
  enabled: { type: Boolean, default: false },
  editorMode: { type: String, default: 'simple' },
  enrollmentPolicy: { type: String, default: 'once' },
  onlyOncePerRecord: { type: Boolean, default: true },
  steps: { type: Array, default: [] },
  filters: { type: Array, default: [] },
}, { timestamps: true, collection: 'workflows' });

const Workflow = mongoose.model('Workflow', workflowSchema);

async function seed() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to CRM DB');

    const existing = await Workflow.findOne({ name: 'New Lead — Welcome Task' });
    if (existing) {
      console.log('Seed workflow already exists, skipping.');
      await mongoose.disconnect();
      return;
    }

    await Workflow.create({
      name: 'New Lead — Welcome Task',
      description: 'Automatically creates a follow-up task when a new lead is added.',
      trigger: 'lead_created',
      enabled: false,
      editorMode: 'simple',
      enrollmentPolicy: 'once',
      onlyOncePerRecord: true,
      steps: [
        {
          type: 'create_task',
          title: 'Follow up with new lead',
          body: 'Reach out within 24 hours.',
          dueInDays: 1,
        }
      ],
      filters: [],
    });

    console.log('✅ Seeded 1 workflow: "New Lead — Welcome Task"');
    await mongoose.disconnect();
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
