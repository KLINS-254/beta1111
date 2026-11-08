import {createClient} from "@supabase/supabase-js";
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({ResultCode:1,ResultDesc:"Method not allowed"});
 try{
  const supabase=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
  const body=req.body?.Body?.stkCallback;if(!body)return res.status(400).json({ResultCode:1,ResultDesc:"Invalid callback"});
  const checkout=body.CheckoutRequestID;const success=String(body.ResultCode)==="0";
  const items=body.CallbackMetadata?.Item||[];const receipt=items.find(x=>x.Name==="MpesaReceiptNumber")?.Value||null;
  const {data:payment}=await supabase.from("mpesa_payments").select("*").eq("checkout_request_id",checkout).maybeSingle();
  if(payment){await supabase.from("mpesa_payments").update({status:success?"paid":"failed",receipt_number:receipt,result_description:body.ResultDesc}).eq("checkout_request_id",checkout);}
  return res.status(200).json({ResultCode:0,ResultDesc:"Accepted"});
 }catch(e){return res.status(200).json({ResultCode:0,ResultDesc:"Received"})}
}
