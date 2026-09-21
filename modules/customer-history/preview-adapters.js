import { cleanString } from '../../shared/string.js';
import { normalizeIndianPhone } from '../../shared/phone.js';
import { toApiIsoString } from '../../shared/date.js';

export function serializePreviewCall(row) {
  return { id:String(row.id||''), customerId:cleanString(row.customer_uid,40), customerUid:cleanString(row.customer_uid,40),
    callerId:normalizeIndianPhone(row.normalized_customer_number||row.caller_id), callerName:cleanString(row.caller_name,100),
    customerName:cleanString(row.customer_name,100), agentId:cleanString(row.agent_id,20), agentName:cleanString(row.agent_name,100),
    direction:cleanString(row.direction,20), status:cleanString(row.status,20), duration:cleanString(row.duration,10),
    date:row.call_date?String(row.call_date).slice(0,10):'', time:cleanString(row.call_time,10), language:cleanString(row.language,30),
    branch:cleanString(row.branch,100), place:cleanString(row.place,100), purpose:cleanString(row.purpose,100),
    callbackStatus:cleanString(row.callback_status,100), notes:cleanString(row.notes,5000), mob2:cleanString(row.mob2,50),
    district:cleanString(row.district,100), businessType:cleanString(row.business_type,100), metalType:cleanString(row.metal_type,100),
    grams:cleanString(row.grams,50), formStatus:cleanString(row.form_status,100), quickNote:cleanString(row.quick_note,500),
    answeredAt:toApiIsoString(row.answered_at), endedAt:toApiIsoString(row.ended_at),
    talkDurationSeconds:Math.max(0,Number(row.talk_duration_seconds)||0), createdAt:toApiIsoString(row.created_at) };
}
export function serializePreviewIntake(row) {
  return { callId:cleanString(row.call_id,120), customerId:cleanString(row.customer_uid,40), customerUid:cleanString(row.customer_uid,40),
    normalizedPhone:normalizeIndianPhone(row.normalized_phone), callerName:cleanString(row.caller_name,100),
    customerName:cleanString(row.customer_name,100), agentId:cleanString(row.agent_id,20), agentName:cleanString(row.agent_name,100),
    mob2:cleanString(row.mob2,50), gender:cleanString(row.gender,20), district:cleanString(row.district,100),
    language:cleanString(row.language,30), businessType:cleanString(row.business_type,100), metalType:cleanString(row.metal_type,100),
    grams:cleanString(row.grams,50), releasingAmount:cleanString(row.releasing_amount,50), pledgePlace:cleanString(row.pledge_place,150),
    otherPledgePlace:cleanString(row.other_pledge_place,150), differenceAmount:cleanString(row.difference_amount,50),
    advertisement:cleanString(row.advertisement,100), lead:cleanString(row.lead,100), formStatus:cleanString(row.form_status,100),
    branch:cleanString(row.branch,100), place:cleanString(row.place,255), purpose:cleanString(row.purpose,100),
    callbackStatus:cleanString(row.callback_status,100), quickNote:cleanString(row.quick_note,500), notes:cleanString(row.notes,5000),
    direction:cleanString(row.call_direction,20), status:cleanString(row.call_status||row.source_status,20),
    duration:cleanString(row.call_duration,10), date:row.call_date?String(row.call_date).slice(0,10):'', time:cleanString(row.call_time,10),
    answeredAt:toApiIsoString(row.call_answered_at), endedAt:toApiIsoString(row.call_ended_at),
    talkDurationSeconds:Math.max(0,Number(row.call_talk_duration_seconds)||0), lastSavedAt:toApiIsoString(row.last_saved_at) };
}

export function createPreviewProfileBuilder(db) {
  return async (phone, customerId='') => {
    let normalized=normalizeIndianPhone(phone);
    if (customerId) {
      const [linked]=await db.query('SELECT normalized_phone FROM attica_customers WHERE customer_uid=? LIMIT 1',[customerId]);
      if (linked[0]?.normalized_phone) normalized=normalizeIndianPhone(linked[0].normalized_phone);
      else { const [linkedCalls]=await db.query(`SELECT normalized_customer_number FROM attica_calls WHERE customer_uid=?
        AND COALESCE(normalized_customer_number,'')<>'' ORDER BY created_at DESC LIMIT 1`,[customerId]);
        if(linkedCalls[0]?.normalized_customer_number) normalized=normalizeIndianPhone(linkedCalls[0].normalized_customer_number); }
    }
    const [matching]=normalized?await db.query(`SELECT normalized_phone FROM attica_customers WHERE normalized_phone=?
      OR RIGHT(REGEXP_REPLACE(COALESCE(mob2,''),'[^0-9]',''),10)=?
      ORDER BY CASE WHEN normalized_phone=? THEN 0 ELSE 1 END,COALESCE(last_saved_at,updated_at,created_at) DESC LIMIT 1`,[normalized,normalized,normalized]):[[]];
    normalized=normalizeIndianPhone(matching[0]?.normalized_phone)||normalized;
    let [customers]=await db.query('SELECT * FROM attica_customers WHERE normalized_phone=? LIMIT 1',[normalized]);
    if (!customers[0]&&customerId) [customers]=await db.query('SELECT * FROM attica_customers WHERE customer_uid=? LIMIT 1',[customerId]);
    const customer=customers[0]||{};
    const actual=normalizeIndianPhone(customer.normalized_phone)||normalized;
    const [intakes]=actual?(await db.query(`SELECT * FROM attica_intake_forms WHERE normalized_phone=?
      ORDER BY COALESCE(last_saved_at,updated_at,created_at) DESC,updated_at DESC,created_at DESC LIMIT 100`,[actual])):[[]];
    const [calls]=actual?(await db.query('SELECT * FROM attica_calls WHERE normalized_customer_number=? ORDER BY created_at DESC LIMIT 100',[actual])):[[]];
    const intake=intakes[0]||{}, call=calls[0]||{};
    const pick=(a,b,c,max=255)=>cleanString(a,max)||cleanString(b,max)||cleanString(c,max);
    const uid=pick(customer.customer_uid,intake.customer_uid,call.customer_uid,40);
    return { phone:actual, customerId:uid, customerUid:uid,
      customerName:pick(customer.customer_name,intake.customer_name,call.customer_name), mob2:pick(customer.mob2,intake.mob2,call.mob2,50),
      age:pick(customer.age,intake.age,call.age,20), gender:pick(customer.gender,intake.gender,call.gender,20),
      district:pick(customer.district,intake.district,call.district,100), location:pick(customer.place,intake.place,call.place),
      branch:pick(customer.branch,intake.branch,call.branch,150), language:pick(customer.language,intake.language,call.language,30),
      businessType:pick(customer.business_type,intake.business_type,call.business_type,100), metalType:pick(customer.metal_type,intake.metal_type,call.metal_type,100),
      grams:pick(customer.grams,intake.grams,call.grams,50), releaseGrossAmount:pick(customer.release_gross_amount,intake.release_gross_amount,call.release_gross_amount,50),
      releasingAmount:pick(customer.releasing_amount,intake.releasing_amount,call.releasing_amount,50), bankName:pick(customer.bank_name,intake.bank_name,call.bank_name,150),
      onlinePrice:pick(customer.online_price,intake.online_price,call.online_price,50), pricePerGram:pick(customer.price_per_gram,intake.price_per_gram,call.price_per_gram,50),
      advertisement:pick(customer.advertisement,intake.advertisement,call.advertisement,100), lead:pick(customer.lead,intake.lead,call.lead,100),
      formStatus:pick(customer.form_status,intake.form_status,call.form_status,100), purpose:pick(customer.purpose,intake.purpose,call.purpose,150),
      notes:pick(customer.notes,intake.notes,call.notes,1000), latestCallStatus:cleanString(call.status,60),
      latestStatus:pick(customer.latest_status,customer.status_update,customer.customer_status,100), latestFormStatus:cleanString(intake.form_status,100),
      latestDisposition:pick(intake.callback_status,call.callback_status,'',150), latestDispositionCategory:'',
      hasSavedDetails:Boolean(customers[0]||intakes.length||calls.length) };
  };
}
