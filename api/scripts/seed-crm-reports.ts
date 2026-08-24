import * as mongoose from 'mongoose';
import { Types } from 'mongoose';

// Ensure the local URI matches what's used in the app
const LOCAL_MONGO_URI_CRM = 'mongodb://127.0.0.1:27017/crm';
const LOCAL_MONGO_URI_HRMS = 'mongodb://127.0.0.1:27017/hrms';

async function seed() {
  console.log('Connecting to MongoDB...');
  
  const hrmsConn = mongoose.createConnection(process.env.MONGO_URI_HRMS || LOCAL_MONGO_URI_HRMS);
  const crmConn = mongoose.createConnection(process.env.MONGO_URI_CRM || LOCAL_MONGO_URI_CRM);

  try {
    const UserModel = hrmsConn.model('user', new mongoose.Schema({}, { strict: false }));
    const adminUser = await UserModel.findOne({ email: 'admin@mathionix.com' }).lean().exec();
    
    if (!adminUser) {
      console.log('Admin user not found. Run standard seed first.');
      return;
    }
    const adminId = String(adminUser._id);
    console.log(`Admin user found: ${adminId}`);

    const freeSchema = new mongoose.Schema({}, { strict: false, collection: 'pipelines' });
    const PipelineModel = crmConn.model('pipeline', freeSchema, 'pipelines');
    const LeadModel = crmConn.model('lead', freeSchema, 'leads');
    const ActivityModel = crmConn.model('activity', freeSchema, 'activities');
    const EmailTemplateModel = crmConn.model('emailtemplate', freeSchema, 'emailtemplates');
    const EmailTrackingModel = crmConn.model('emailtracking', freeSchema, 'emailtrackings');
    const WorkflowModel = crmConn.model('workflow', freeSchema, 'workflows');
    const WorkflowExecutionModel = crmConn.model('workflowexecution', freeSchema, 'workflowexecutions');

    // 1. Pipeline
    let pipeline = await PipelineModel.findOne({ name: 'Standard Sales Pipeline' });
    if (!pipeline) {
      pipeline = await PipelineModel.create({
        name: 'Standard Sales Pipeline',
        type: 'leads',
        stages: [
          { name: 'Lead In', order: 1 },
          { name: 'Contact Made', order: 2 },
          { name: 'Proposal Presented', order: 3 },
          { name: 'Negotiation', order: 4 },
          { name: 'Closed Won', order: 5 },
          { name: 'Closed Lost', order: 6 },
        ],
        isActive: true
      });
      console.log('Pipeline created');
    }

    const pipelineId = pipeline._id;

    // 2. Leads & Templates
    console.log('Seeding templates, leads and tracking...');
    await EmailTemplateModel.deleteMany({ name: { $regex: 'Demo Template' } });
    const template1 = await EmailTemplateModel.create({ name: 'Demo Template 1 (High Conv)', subject: 'Welcome!', isActive: true });
    const template2 = await EmailTemplateModel.create({ name: 'Demo Template 2 (Low Conv)', subject: 'Following up', isActive: true });
    const template3 = await EmailTemplateModel.create({ name: 'Demo Template 3 (Avg)', subject: 'Checking in', isActive: true });

    await LeadModel.deleteMany({ firstName: { $regex: 'Demo' } });
    await EmailTrackingModel.deleteMany({ messageId: { $regex: 'demo-' } });
    
    // Create Leads
    const leads = [];
    for (let i = 0; i < 20; i++) {
      const converted = i % 3 === 0; // 33% conversion rate
      leads.push({
        firstName: 'Demo',
        lastName: `Lead ${i}`,
        email: `demo.lead${i}@example.com`,
        leadOwner: adminId,
        pipeline: pipelineId,
        converted: converted,
        createdAt: new Date()
      });
    }
    const insertedLeads = await LeadModel.insertMany(leads);

    // Create EmailTracking tied to Leads and Templates
    const trackings = [];
    for (let i = 0; i < insertedLeads.length; i++) {
      const lead = insertedLeads[i];
      let templateId;
      if ((lead as any).converted) {
        templateId = template1._id; // High conversion template gets converted leads
      } else {
        templateId = i % 2 === 0 ? template2._id : template3._id;
      }
      
      trackings.push({
        messageId: `demo-msg-${i}`,
        templateId: templateId,
        entityId: lead._id,
        module: 'lead',
        userId: new Types.ObjectId(adminId),
        openCount: i % 2 === 0 ? 2 : 0, // 50% open rate
        clicks: i % 4 === 0 ? ['http://example.com'] : [], // 25% click rate
        trackingToken: `demo-token-${i}-${Date.now()}`,
        createdAt: new Date()
      });
    }
    await EmailTrackingModel.insertMany(trackings);

    // 3. Activities
    console.log('Seeding activities...');
    await ActivityModel.deleteMany({ type: { $in: ['call', 'meeting', 'email'] }, author: new Types.ObjectId(adminId) });
    await ActivityModel.insertMany([
      { type: 'call', author: new Types.ObjectId(adminId), content: 'Demo Call' },
      { type: 'call', author: new Types.ObjectId(adminId), content: 'Demo Call 2' },
      { type: 'meeting', author: new Types.ObjectId(adminId), content: 'Demo Meeting' },
      { type: 'email', author: new Types.ObjectId(adminId), content: 'Demo Email' },
    ]);

    // 4. Workflows
    console.log('Seeding workflows...');
    await WorkflowModel.deleteMany({ name: { $regex: 'Demo' } });
    await WorkflowExecutionModel.deleteMany({ workflowId: { $exists: true } });
    
    const wf1 = await WorkflowModel.create({ name: 'Demo Onboarding Workflow', isActive: true });
    const wf2 = await WorkflowModel.create({ name: 'Demo Nurture Workflow', isActive: true });

    await WorkflowExecutionModel.insertMany([
      { workflowId: wf1._id, status: 'completed', createdAt: new Date() },
      { workflowId: wf1._id, status: 'completed', createdAt: new Date() },
      { workflowId: wf1._id, status: 'failed', createdAt: new Date() },
      { workflowId: wf2._id, status: 'active', createdAt: new Date() },
    ]);

    console.log('Done seeding reports demo data!');
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    await hrmsConn.close();
    await crmConn.close();
    process.exit(0);
  }
}

seed();
