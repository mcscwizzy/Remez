variable "environment" {
  type        = string
  description = "Environment name (dev, prod, etc.)"
}

variable "location" {
  type    = string
  default = "eastus"
}

variable "image" {
  description = "Full GHCR image reference (tagged), e.g. ghcr.io/owner/remez-api:sha"
  type        = string
}

variable "container_port" {
  type    = number
  default = 8000
}

variable "ghcr_username" {
  type      = string
  sensitive = true
}

variable "ghcr_pat" {
  type      = string
  sensitive = true
}

variable "azure_ai_endpoint" {
  type      = string
  sensitive = true
}

variable "azure_ai_api_key" {
  type      = string
  sensitive = true
}