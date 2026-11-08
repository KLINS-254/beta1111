const {createClient}=require("@supabase/supabase-js");
const b64=(s)=>Buffer.from(s).toString("base64");
const base=()=>process.env.DARAJA_ENV==="production"?"https://api.safaricom.co.ke":"https://sandbox.safaricom.co.ke";
async function token(){const auth=b64(`${process.env.DARAJA_CONSUMER_KEY}:${process.env.DARAJA_CONSUMER_SECRET}`);const r=await fetch(`${base()}/oauth/v1/generate?grant_type=client_credentials`,{headers:{Authorization:`Basic ${auth}`}});const j=await r.json();if(!r.ok)throw Error(j.errorMessage||"Daraja authentication failed");return j.access_token}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 try{
  const auth=req.headers.authorization||"";const jwt=auth.replace(/^Bearer\s+/i,"");if(!jwt)return res.status(401).json({error:"Sign in required"});
  const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const {data:{user},error:uerr}=await supabase.auth.getUser(jwt);if(uerr||!user)return res.status(401).json({error:"Invalid session"});
  const {phone,amount}=req.body||{};const numeric=Number(amount);if(!/^(\+?254|0)(7|1)\d{8}$/.test(String(phone||""))||!Number.isInteger(numeric)||numeric<1||numeric>150000)return res.status(400).json({error:"Enter a valid Kenyan phone number and whole KSh amount"});
  const shortcode=process.env.DARAJA_SHORTCODE,passkey=process.env.DARAJA_PASSKEY;if(!shortcode||!passkey)throw Error("Daraja credentials are not configured");
  const now=new Date();const stamp=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Nairobi",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).format(now).replace(/[^\d]/g,"");
  const password=b64(`${shortcode}${passkey}${stamp}`);const access=await token();
  const msisdn=String(phone).replace(/^\+/,"").replace(/^0/,"254");
  const payload={BusinessShortCode:shortcode,Password:password,Timestamp:stamp,TransactionType:process.env.DARAJA_TRANSACTION_TYPE||"CustomerPayBillOnline",Amount:numeric,PartyA:msisdn,PartyB:shortcode,PhoneNumber:msisdn,CallBackURL:process.env.DARAJA_CALLBACK_URL,AccountReference:"ADBETA",TransactionDesc:"ADBETA payment"};
  const r=await fetch(`${base()}/mpesa/stkpush/v1/processrequest`,{method:"POST",headers:{Authorization:`Bearer ${access}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});const out=await r.json();if(!r.ok||out.ResponseCode!=="0")return res.status(400).json({error:out.errorMessage||out.ResponseDescription||"STK request failed"});
  const {error:dbErr}=await supabase.from("mpesa_payments").insert({user_id:user.id,phone:msisdn,amount_kes:numeric,merchant_request_id:out.MerchantRequestID,checkout_request_id:out.CheckoutRequestID,status:"pending"});
  if(dbErr)throw dbErr;
  return res.status(200).json({message:"STK push sent. Enter your M-Pesa PIN on your phone to approve.",checkoutRequestId:out.CheckoutRequestID});
 }catch(e){return res.status(500).json({error:e.message||"Payment request failed"})}
}
