{{/*
Expand the name of the chart.
*/}}
{{- define "stepaway.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "stepaway.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart name and version as used by the chart label.
*/}}
{{- define "stepaway.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels, applied to every object this chart renders.
*/}}
{{- define "stepaway.labels" -}}
helm.sh/chart: {{ include "stepaway.chart" . }}
{{ include "stepaway.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: stepaway
{{- with .Values.extraLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "stepaway.selectorLabels" -}}
app.kubernetes.io/name: {{ include "stepaway.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Name of the ServiceAccount to use.
*/}}
{{- define "stepaway.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "stepaway.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Name of the bearer-token Secret.
*/}}
{{- define "stepaway.authSecretName" -}}
{{- /* NOT "-auth": the backend itself owns a Secret named `stepaway-auth`
     (the Claude OAuth token), which would collide for a release named
     "stepaway". */ -}}
{{- printf "%s-server-token" (include "stepaway.fullname" .) }}
{{- end }}

{{/*
Name of the docker-registry subchart's objects (Service/Deployment/PVC).
Mirrors the subchart's own `docker-registry.fullname` exactly, including the
`fullnameOverride` / `nameOverride` escape hatches — the dependency is aliased
to `registry`, so .Chart.Name inside it is "registry" and that is the default
`$name` here. Anything that references the registry Service by name (the
Ingress backend, the GC command in NOTES.txt) goes through this helper, so all
three stay in step when a user overrides the name.
*/}}
{{- define "stepaway.registryFullname" -}}
{{- if .Values.registry.fullnameOverride }}
{{- .Values.registry.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default "registry" .Values.registry.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Backend image reference.
*/}}
{{- define "stepaway.image" -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.image.repository $tag }}
{{- end }}
