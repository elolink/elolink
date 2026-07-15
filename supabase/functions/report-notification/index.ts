import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { report_id } = await req.json();
    if (!report_id) {
      return new Response(JSON.stringify({ error: "report_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch the report with workspace and creator info
    const { data: report, error: reportError } = await supabase
      .from("progress_reports")
      .select(`
        *,
        workspace:workspaces(*),
        created_by_profile:profiles!progress_reports_created_by_fkey(*)
      `)
      .eq("id", report_id)
      .maybeSingle();

    if (reportError || !report) {
      return new Response(JSON.stringify({ error: "Report not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all workspace members with their emails
    const { data: members } = await supabase
      .from("workspace_members")
      .select(`
        user_id,
        role,
        profile:profiles!workspace_members_user_id_fkey(*)
      `)
      .eq("workspace_id", report.workspace_id);

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ message: "No members to notify" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch emails from auth.users via admin API
    const notifications: Array<{ email: string; user_id: string }> = [];
    for (const member of members) {
      const { data: user } = await supabase.auth.admin.getUserById(member.user_id);
      if (user?.user?.email) {
        notifications.push({ email: user.user.email, user_id: member.user_id });
      }
    }

    const subject = `Progress Report Complete: ${report.title}`;
    const body = `
A progress report has been marked as complete.

Report: ${report.title}
Workspace: ${report.workspace?.name ?? "Unknown"}
Date Range: ${report.start_date} to ${report.end_date}
Completion: ${report.completion_pct}%
Status: Complete

View the full report in your EloLink workspace.

— EloLink
`;

    // Log notifications in the database
    for (const notif of notifications) {
      await supabase.from("notification_log").insert({
        report_id: report_id,
        recipient_email: notif.email,
        recipient_user_id: notif.user_id,
        subject,
        body,
      });
    }

    return new Response(
      JSON.stringify({
        message: "Notifications logged",
        recipients: notifications.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
