variable "environment" {
  type        = string
  description = "Environment name (dev, prod, etc.)"
}

variable "location" {
  type    = string
  default = "eastus"
}

variable "image" {
  description = "Full container image reference (tagged), e.g. ghcr.io/owner/remez-api:sha"
  type        = string
}

variable "ui_image" {
  description = "Full UI container image reference (tagged), e.g. ghcr.io/owner/remez-ui:sha"
  type        = string
}

variable "container_port" {
  type    = number
  default = 8000
}

variable "ui_container_port" {
  type    = number
  default = 80
}

variable "registry_server" {
  description = "Container registry server, e.g. ghcr.io or <name>.azurecr.io"
  type        = string
}

variable "registry_username" {
  type      = string
  sensitive = true
}

variable "registry_password" {
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
