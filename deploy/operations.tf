terraform {
  required_version = ">= 1.6, < 2"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}
variable "project_id" { type = string }
variable "service_name" { type = string }
variable "site_hostname" { type = string }
variable "notification_channels" { type = list(string) }
provider "google" { project = var.project_id }

# References an existing Firestore database; it does not create or replace it.
resource "google_firestore_backup_schedule" "daily" {
  project   = var.project_id
  database  = "(default)"
  retention = "604800s"
  daily_recurrence {}
}
resource "google_monitoring_uptime_check_config" "health" {
  display_name = "SkyRehearsal health"
  timeout      = "10s"
  period       = "60s"
  http_check {
    path         = "/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }
  monitored_resource {
    type   = "uptime_url"
    labels = { project_id = var.project_id, host = var.site_hostname }
  }
}
resource "google_logging_metric" "api_errors" {
  name   = "sky_rehearsal_api_errors"
  filter = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${var.service_name}\" AND jsonPayload.event=\"api_request\" AND jsonPayload.status>=500"
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}
resource "google_monitoring_alert_policy" "api_errors" {
  display_name          = "SkyRehearsal API failures"
  combiner              = "OR"
  notification_channels = var.notification_channels
  conditions {
    display_name = "API errors sustained for five minutes"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/${google_logging_metric.api_errors.name}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  display_name          = "SkyRehearsal unavailable"
  combiner              = "OR"
  notification_channels = var.notification_channels
  conditions {
    display_name = "Most uptime regions fail for five minutes"
    condition_threshold {
      filter          = "resource.type=\"uptime_url\" AND metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.labels.check_id=\"${google_monitoring_uptime_check_config.health.uptime_check_id}\""
      duration        = "300s"
      comparison      = "COMPARISON_LT"
      threshold_value = 0.5
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_FRACTION_TRUE"
        cross_series_reducer = "REDUCE_MEAN"
      }
    }
  }
}
