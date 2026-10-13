// Go sources are written with 4-space indents and converted to tabs, so gofmt accepts the generated files.
const go = (src) => src.replace(/^(?: {4})+/gm, (indent) => '\t'.repeat(indent.length / 4));

const gomod = (version, extra = '') => `module github.com/eastside-commons/seedling

go ${version}
${extra}`;

const gitignore = `/seedling
*.csv
.env
`;

const daysGo = go(`package schedule

import "time"

// WateringDays returns every watering day in the given number of weeks,
// starting at from.
func WateringDays(from time.Time, weeks int) []time.Time {
    end := from.AddDate(0, 0, 7*weeks)
    var days []time.Time
    for d := from; d.Before(end); d = d.AddDate(0, 0, 1) {
        if d.Weekday() == time.Sunday {
            continue
        }
        days = append(days, d)
    }
    return days
}
`);

const daysTestGo = go(`package schedule

import (
    "testing"
    "time"
)

func TestWateringDays(t *testing.T) {
    mon := time.Date(2024, time.May, 6, 0, 0, 0, 0, time.UTC)
    days := WateringDays(mon, 2)
    if len(days) != 12 {
        t.Fatalf("got %d days, want 12", len(days))
    }
    for _, d := range days {
        if d.Weekday() == time.Sunday {
            t.Errorf("%s is a Sunday", d.Format("2006-01-02"))
        }
    }
}
`);

const mainGoV1 = (header, row) => go(`package main

import (
    "encoding/csv"
    "flag"
    "log"
    "os"
    "time"

    "github.com/eastside-commons/seedling/internal/schedule"
)

func main() {
    from := flag.String("from", "", "first day of the sheet, YYYY-MM-DD")
    weeks := flag.Int("weeks", 4, "how many weeks to export")
    flag.Parse()

    start, err := time.Parse("2006-01-02", *from)
    if err != nil {
        log.Fatalf("bad -from date: %v", err)
    }

    w := csv.NewWriter(os.Stdout)
    w.Write([]string{${header}})
    for _, d := range schedule.WateringDays(start, *weeks) {
        w.Write([]string{${row}})
    }
    w.Flush()
    if err := w.Error(); err != nil {
        log.Fatal(err)
    }
}
`);

const mainGo = (commands) => go(`package main

import (
    "fmt"
    "os"
)

const usage = \`usage: seedling <command> [flags]

commands:
${commands.map(([name, desc]) => `  ${name.padEnd(8)} ${desc}`).join('\n')}\`

func main() {
    if len(os.Args) < 2 {
        fmt.Fprintln(os.Stderr, usage)
        os.Exit(2)
    }
    args := os.Args[2:]
    switch os.Args[1] {
${commands.map(([name]) => `    case "${name}":\n        ${name}(args)`).join('\n')}
    default:
        fmt.Fprintln(os.Stderr, usage)
        os.Exit(2)
    }
}
`);

const exportGoV1 = go(`package main

import (
    "encoding/csv"
    "flag"
    "log"
    "os"
    "time"

    "github.com/eastside-commons/seedling/internal/schedule"
)

func export(args []string) {
    flags := flag.NewFlagSet("export", flag.ExitOnError)
    from := flags.String("from", "", "first day of the sheet, YYYY-MM-DD")
    weeks := flags.Int("weeks", 4, "how many weeks to export")
    flags.Parse(args)

    start, err := time.Parse("2006-01-02", *from)
    if err != nil {
        log.Fatalf("bad -from date: %v", err)
    }

    w := csv.NewWriter(os.Stdout)
    w.Write([]string{"date", "day", "volunteer", "notes"})
    for _, d := range schedule.WateringDays(start, *weeks) {
        w.Write([]string{d.Format("2006-01-02"), d.Format("Monday"), "", ""})
    }
    w.Flush()
    if err := w.Error(); err != nil {
        log.Fatal(err)
    }
}
`);

const exportGoV2 = go(`package main

import (
    "encoding/csv"
    "flag"
    "log"
    "os"
    "time"

    "github.com/eastside-commons/seedling/internal/schedule"
    "github.com/eastside-commons/seedling/internal/store"
)

func export(args []string) {
    flags := flag.NewFlagSet("export", flag.ExitOnError)
    from := flags.String("from", "", "first day to schedule, YYYY-MM-DD")
    weeks := flags.Int("weeks", 1, "how many weeks to schedule")
    data := flags.String("data", "volunteers.csv", "volunteer roster")
    flags.Parse(args)

    start, err := time.Parse("2006-01-02", *from)
    if err != nil {
        log.Fatalf("bad -from date: %v", err)
    }
    all, err := store.Open(*data).All()
    if err != nil {
        log.Fatal(err)
    }
    roster := make([]schedule.Volunteer, len(all))
    for i, v := range all {
        roster[i] = schedule.Volunteer{Name: v.Name, Days: v.Days}
    }

    w := csv.NewWriter(os.Stdout)
    w.Write([]string{"date", "day", "volunteer"})
    for _, s := range schedule.Assign(schedule.WateringDays(start, *weeks), roster) {
        w.Write([]string{s.Date.Format("2006-01-02"), s.Date.Format("Monday"), s.Volunteer})
    }
    w.Flush()
    if err := w.Error(); err != nil {
        log.Fatal(err)
    }
}
`);

const storeGo = go(`package store

import (
    "encoding/csv"
    "errors"
    "io/fs"
    "os"
    "strings"
    "sync"
    "time"
)

// Volunteer is one row of volunteers.csv.
type Volunteer struct {
    Name  string
    Phone string
    Email string
    Days  []time.Weekday
}

// Store is the volunteer roster, kept as a CSV file.
type Store struct {
    path string
    mu   sync.Mutex
}

func Open(path string) *Store { return &Store{path: path} }

func (s *Store) Add(v Volunteer) error {
    s.mu.Lock()
    defer s.mu.Unlock()
    f, err := os.OpenFile(s.path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
    if err != nil {
        return err
    }
    defer f.Close()
    w := csv.NewWriter(f)
    w.Write([]string{v.Name, v.Phone, v.Email, formatDays(v.Days)})
    w.Flush()
    return w.Error()
}

func (s *Store) All() ([]Volunteer, error) {
    s.mu.Lock()
    defer s.mu.Unlock()
    f, err := os.Open(s.path)
    if errors.Is(err, fs.ErrNotExist) {
        return nil, nil
    }
    if err != nil {
        return nil, err
    }
    defer f.Close()
    rows, err := csv.NewReader(f).ReadAll()
    if err != nil {
        return nil, err
    }
    all := make([]Volunteer, 0, len(rows))
    for _, r := range rows {
        all = append(all, Volunteer{Name: r[0], Phone: r[1], Email: r[2], Days: parseDays(r[3])})
    }
    return all, nil
}

func formatDays(days []time.Weekday) string {
    names := make([]string, len(days))
    for i, d := range days {
        names[i] = d.String()[:3]
    }
    return strings.Join(names, " ")
}

func parseDays(s string) []time.Weekday {
    var days []time.Weekday
    for _, name := range strings.Fields(s) {
        for d := time.Monday; d <= time.Saturday; d++ {
            if d.String()[:3] == name {
                days = append(days, d)
            }
        }
    }
    return days
}
`);

const shiftsWho = `// Who returns the volunteer on date, or "" if the day is open or not scheduled.
func (s *Shifts) Who(date time.Time) (string, error) {
    s.mu.Lock()
    defer s.mu.Unlock()
    rows, err := s.read()
    if err != nil {
        return "", err
    }
    for _, r := range rows {
        if r[0] == date.Format("2006-01-02") {
            return r[2], nil
        }
    }
    return "", nil
}
`;

const shiftsRead = `func (s *Shifts) read() ([][]string, error) {
    f, err := os.Open(s.path)
    if err != nil {
        return nil, err
    }
    defer f.Close()
    return csv.NewReader(f).ReadAll()
}
`;

const shiftsHead = (imports) => `package store

import (
${imports.map((name) => `    "${name}"`).join('\n')}
)

// Shifts is the schedule file written by \`seedling export\`: date, day, volunteer.
type Shifts struct {
    path string
    mu   sync.Mutex
}

func OpenShifts(path string) *Shifts { return &Shifts{path: path} }
`;

const shiftsGoV1 = go([shiftsHead(['encoding/csv', 'os', 'sync', 'time']), shiftsWho, shiftsRead].join('\n'));

const shiftsGoV2 = go([
  shiftsHead(['encoding/csv', 'fmt', 'os', 'sync', 'time']),
  shiftsWho,
  `// Reassign hands from's shift on date to someone else.
func (s *Shifts) Reassign(date time.Time, from, to string) error {
    s.mu.Lock()
    defer s.mu.Unlock()
    rows, err := s.read()
    if err != nil {
        return err
    }
    for _, r := range rows {
        if r[0] == date.Format("2006-01-02") && r[2] == from {
            r[2] = to
            return s.write(rows)
        }
    }
    return fmt.Errorf("no shift for %s on %s", from, date.Format("2006-01-02"))
}
`,
  shiftsRead,
  `func (s *Shifts) write(rows [][]string) error {
    f, err := os.Create(s.path)
    if err != nil {
        return err
    }
    w := csv.NewWriter(f)
    if err := w.WriteAll(rows); err != nil {
        f.Close()
        return err
    }
    return f.Close()
}
`,
].join('\n'));

const assignGo = (noRepeat, fewer = '<') => go(`package schedule

import (
    "slices"
    "time"
)

// Volunteer is someone on the roster and the weekdays they said they can water.
type Volunteer struct {
    Name string
    Days []time.Weekday
}

// Shift is one watering day and who has it. Volunteer is "" if nobody could.
type Shift struct {
    Date      time.Time
    Volunteer string
}

// Assign gives each day to the free volunteer with the fewest shifts so far.
// Ties go to whoever comes first in the roster.
func Assign(days []time.Time, roster []Volunteer) []Shift {
    count := map[string]int{}
${noRepeat ? '    last := map[string]time.Time{}\n' : ''}    var shifts []Shift
    for _, day := range days {
        pick := ""
        for _, v := range roster {
            if !slices.Contains(v.Days, day.Weekday()) {
                continue
            }
${noRepeat ? `            if last[v.Name].Equal(day.AddDate(0, 0, -1)) {
                continue
            }
` : ''}            if pick == "" || count[v.Name] ${fewer} count[pick] {
                pick = v.Name
            }
        }
        if pick != "" {
            count[pick]++
${noRepeat ? '            last[pick] = day\n' : ''}        }
        shifts = append(shifts, Shift{Date: day, Volunteer: pick})
    }
    return shifts
}
`);

const assignTestGo = (want) => go(`package schedule

import (
    "testing"
    "time"
)

func TestAssign(t *testing.T) {
    mon := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
    everyDay := []time.Weekday{time.Monday, time.Tuesday, time.Wednesday, time.Thursday, time.Friday, time.Saturday}
    roster := []Volunteer{
        {Name: "Ana", Days: everyDay},
        {Name: "Ben", Days: []time.Weekday{time.Monday, time.Tuesday}},
    }
    got := Assign(WateringDays(mon, 1), roster)
    want := []string{${want.map((name) => JSON.stringify(name)).join(', ')}}
    if len(got) != len(want) {
        t.Fatalf("got %d shifts, want %d", len(got), len(want))
    }
    for i, s := range got {
        if s.Volunteer != want[i] {
            t.Errorf("%s: got %q, want %q", s.Date.Format("Mon"), s.Volunteer, want[i])
        }
    }
}
`);

const serveGo = (withSwap) => go(`package main

import (
    "flag"
    "html/template"
    "log"
    "net/http"
${withSwap ? '    "os"\n' : ''}    "time"

    "github.com/eastside-commons/seedling/internal/store"
${withSwap ? '    "github.com/eastside-commons/seedling/internal/swap"\n' : ''})

var weekdays = []time.Weekday{
    time.Monday, time.Tuesday, time.Wednesday, time.Thursday, time.Friday, time.Saturday,
}

func serve(args []string) {
    flags := flag.NewFlagSet("serve", flag.ExitOnError)
    addr := flags.String("addr", ":8080", "listen address")
    data := flags.String("data", "volunteers.csv", "volunteer roster")
${withSwap ? '    shifts := flags.String("shifts", "shifts.csv", "schedule written by export")\n' : ''}    flags.Parse(args)

    roster := store.Open(*data)
    page := template.Must(template.ParseFiles("templates/signup.html"))
${withSwap ? `    signer := swap.Signer{Key: []byte(os.Getenv("SEEDLING_SWAP_KEY"))}
    swapRoutes(signer, store.OpenShifts(*shifts), roster)
` : ''}
    http.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
        page.Execute(w, map[string]any{"Days": weekdays})
    })
    http.HandleFunc("POST /signup", func(w http.ResponseWriter, r *http.Request) {
        v := store.Volunteer{
            Name:  r.FormValue("name"),
            Phone: r.FormValue("phone"),
            Email: r.FormValue("email"),
        }
        for _, d := range weekdays {
            if r.FormValue(d.String()) == "on" {
                v.Days = append(v.Days, d)
            }
        }
        if v.Name == "" {
            http.Error(w, "Please tell us your name.", http.StatusBadRequest)
            return
        }
        if err := roster.Add(v); err != nil {
            log.Printf("signup %q: %v", v.Name, err)
            http.Error(w, "Something went wrong. Please tell Rosa.", http.StatusInternalServerError)
            return
        }
        page.Execute(w, map[string]any{"Days": weekdays, "Thanks": v.Name})
    })

    log.Printf("sign-up site listening on %s", *addr)
    log.Fatal(http.ListenAndServe(*addr, nil))
}
`);

const signupHtml = ({ thanks, phone, email }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Eastside Commons watering sign-up</title>
  <style>
    body { font-family: sans-serif; font-size: 1.25rem; max-width: 32rem; margin: 2rem auto; padding: 0 1rem; }
    input[type=text], input[type=tel], input[type=email] { width: 100%; font-size: 1.25rem; padding: .4rem; }
    input[type=checkbox] { width: 1.5rem; height: 1.5rem; }
    button { font-size: 1.5rem; padding: .7rem 1.4rem; }
  </style>
</head>
<body>
  <h1>Water the garden</h1>
  {{if .Thanks}}<p><strong>${thanks}</strong></p>{{end}}
  <form method="post" action="/signup">
    <p><label>Your name<br><input type="text" name="name" required></label></p>
    <p><label>${phone}<br><input type="tel" name="phone"></label></p>
    <p><label>${email}<br><input type="email" name="email"></label></p>
    <p>Which days can you usually water?</p>
    {{range .Days}}<p><label><input type="checkbox" name="{{.}}"> {{.}}</label></p>
    {{end}}
    <p><button type="submit">Sign me up</button></p>
  </form>
</body>
</html>
`;

const signup = {
  typo: { thanks: 'Thank you for signing up, {{.Thanks}}! See you at the gardne.', phone: 'Phone (so Rosa can reach you)', email: 'Email' },
};
signup.fixed = { ...signup.typo, thanks: 'Thank you for signing up, {{.Thanks}}! See you at the garden.' };
signup.sms = { ...signup.fixed, phone: 'Cell phone (we text you the evening before your shift)' };
signup.email = { ...signup.fixed, phone: 'Phone (optional, so Rosa can call you)', email: 'Email (we email you the evening before your shift)' };

const smsGo = go(`package notify

import (
    "fmt"
    "net/http"
    "net/url"
    "strings"
)

// SMS sends text messages through Twilio's REST API.
type SMS struct {
    AccountSID string
    AuthToken  string
    From       string
}

func (s SMS) Send(to, body string) error {
    form := url.Values{"To": {to}, "From": {s.From}, "Body": {body}}
    endpoint := "https://api.twilio.com/2010-04-01/Accounts/" + s.AccountSID + "/Messages.json"
    req, err := http.NewRequest("POST", endpoint, strings.NewReader(form.Encode()))
    if err != nil {
        return err
    }
    req.SetBasicAuth(s.AccountSID, s.AuthToken)
    req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()
    if resp.StatusCode >= 300 {
        return fmt.Errorf("twilio: %s", resp.Status)
    }
    return nil
}
`);

const emailGo = go(`package notify

import (
    "fmt"
    "net/smtp"
    "strings"
)

// Email sends plain-text mail through the garden's Gmail account.
type Email struct {
    Addr     string
    User     string
    Password string
}

func (e Email) Send(to, subject, body string) error {
    host, _, _ := strings.Cut(e.Addr, ":")
    auth := smtp.PlainAuth("", e.User, e.Password, host)
    msg := fmt.Sprintf("From: Eastside Commons Garden <%s>\\r\\nTo: %s\\r\\nSubject: %s\\r\\n\\r\\n%s",
        e.User, to, subject, body)
    return smtp.SendMail(e.Addr, auth, e.User, []string{to}, []byte(msg))
}
`);

const remindFind = `func find(roster *store.Store, name string) (store.Volunteer, error) {
    all, err := roster.All()
    if err != nil {
        return store.Volunteer{}, err
    }
    for _, v := range all {
        if v.Name == name {
            return v, nil
        }
    }
    return store.Volunteer{}, fmt.Errorf("%s is on the schedule but not on the roster", name)
}
`;

const remindHead = (imports, internal) => `package main

import (
${imports.map((name) => `    "${name}"`).join('\n')}

${internal.map((name) => `    "github.com/eastside-commons/seedling/internal/${name}"`).join('\n')}
)

func remind(args []string) {
    flags := flag.NewFlagSet("remind", flag.ExitOnError)
    data := flags.String("data", "volunteers.csv", "volunteer roster")
    shifts := flags.String("shifts", "shifts.csv", "schedule written by export")
    flags.Parse(args)

    tomorrow := time.Now().AddDate(0, 0, 1)
    name, err := store.OpenShifts(*shifts).Who(tomorrow)
    if err != nil {
        log.Fatal(err)
    }
    if name == "" {
        log.Printf("nobody to remind for %s", tomorrow.Format("Mon Jan 2"))
        return
    }
    v, err := find(store.Open(*data), name)
    if err != nil {
        log.Fatal(err)
    }
`;

const twilioClient = `    sms := notify.SMS{
        AccountSID: os.Getenv("TWILIO_ACCOUNT_SID"),
        AuthToken:  os.Getenv("TWILIO_AUTH_TOKEN"),
        From:       os.Getenv("TWILIO_FROM"),
    }
`;

const swapLink = `    signer := swap.Signer{Key: []byte(os.Getenv("SEEDLING_SWAP_KEY"))}
    link := os.Getenv("SEEDLING_URL") + "/swap?t=" + url.QueryEscape(signer.Token(tomorrow, v.Name))
`;

const remindGoV1 = go([
  remindHead(['flag', 'fmt', 'log', 'os', 'time'], ['notify', 'store'])
    + `
${twilioClient}    msg := fmt.Sprintf("Hi %s! You're watering at Eastside Commons tomorrow, %s. Thank you!",
        v.Name, tomorrow.Format("Mon Jan 2"))
    if err := sms.Send(v.Phone, msg); err != nil {
        log.Fatalf("texting %s: %v", v.Name, err)
    }
}
`,
  remindFind,
].join('\n'));

const remindGoV2 = go([
  remindHead(['flag', 'fmt', 'log', 'net/url', 'os', 'time'], ['notify', 'store', 'swap'])
    + `
${swapLink}${twilioClient}    msg := fmt.Sprintf("Hi %s! You're watering at Eastside Commons tomorrow, %s. Can't make it? %s",
        v.Name, tomorrow.Format("Mon Jan 2"), link)
    if err := sms.Send(v.Phone, msg); err != nil {
        log.Fatalf("texting %s: %v", v.Name, err)
    }
}
`,
  remindFind,
].join('\n'));

const remindGoV3 = go([
  remindHead(['flag', 'fmt', 'log', 'net/url', 'os', 'time'], ['notify', 'store', 'swap'])
    + `    if v.Email == "" {
        log.Printf("%s has no email on file, skipping", v.Name)
        return
    }

${swapLink}    mail := notify.Email{
        Addr:     "smtp.gmail.com:587",
        User:     os.Getenv("SEEDLING_SMTP_USER"),
        Password: os.Getenv("SEEDLING_SMTP_PASSWORD"),
    }
    body := fmt.Sprintf("Hi %s,\\n\\nYou're watering at Eastside Commons tomorrow, %s.\\n\\n"+
        "Can't make it? Hand your shift to someone else here:\\n%s\\n\\nThank you!\\nThe garden crew\\n",
        v.Name, tomorrow.Format("Monday, January 2"), link)
    if err := mail.Send(v.Email, "Watering tomorrow", body); err != nil {
        log.Fatalf("emailing %s: %v", v.Name, err)
    }
}
`,
  remindFind,
].join('\n'));

const swapPkgGo = go(`package swap

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/base64"
    "strings"
    "time"
)

// Signer makes and checks swap links. A token names one volunteer and one
// date, so whoever holds the link can hand off that shift and nothing else.
type Signer struct {
    Key []byte
}

func (s Signer) Token(date time.Time, name string) string {
    payload := date.Format("2006-01-02") + "|" + name
    return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + s.sign(payload)
}

// Open checks a token and returns its shift. Tokens stop working after the shift date.
func (s Signer) Open(token string, now time.Time) (time.Time, string, bool) {
    raw, sig, found := strings.Cut(token, ".")
    if !found {
        return time.Time{}, "", false
    }
    b, err := base64.RawURLEncoding.DecodeString(raw)
    if err != nil || !hmac.Equal([]byte(sig), []byte(s.sign(string(b)))) {
        return time.Time{}, "", false
    }
    day, name, _ := strings.Cut(string(b), "|")
    date, err := time.Parse("2006-01-02", day)
    if err != nil || date.Before(now.Truncate(24*time.Hour)) {
        return time.Time{}, "", false
    }
    return date, name, true
}

func (s Signer) sign(payload string) string {
    mac := hmac.New(sha256.New, s.Key)
    mac.Write([]byte(payload))
    return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
`);

const swapTestGo = go(`package swap

import (
    "testing"
    "time"
)

func TestTokenRoundTrip(t *testing.T) {
    s := Signer{Key: []byte("test key")}
    thu := time.Date(2024, time.August, 8, 0, 0, 0, 0, time.UTC)
    date, name, ok := s.Open(s.Token(thu, "Walt"), thu)
    if !ok || name != "Walt" || !date.Equal(thu) {
        t.Fatalf("Open = %v %q %v, want %v Walt true", date, name, ok, thu)
    }
    if _, _, ok := s.Open(s.Token(thu, "Walt"), thu.AddDate(0, 0, 1)); ok {
        t.Error("token still works the day after the shift")
    }
    if _, _, ok := (Signer{Key: []byte("other")}).Open(s.Token(thu, "Walt"), thu); ok {
        t.Error("token signed with a different key was accepted")
    }
}
`);

const swapWebGo = (checkTaker, checkNextTo = false) => go(`package main

import (
    "html/template"
    "log"
    "net/http"
    "time"

    "github.com/eastside-commons/seedling/internal/store"
    "github.com/eastside-commons/seedling/internal/swap"
)

func swapRoutes(signer swap.Signer, shifts *store.Shifts, roster *store.Store) {
    page := template.Must(template.ParseFiles("templates/swap.html"))

    http.HandleFunc("GET /swap", func(w http.ResponseWriter, r *http.Request) {
        date, name, ok := signer.Open(r.FormValue("t"), time.Now())
        if !ok {
            http.Error(w, "This swap link has expired.", http.StatusGone)
            return
        }
        everyone, err := roster.All()
        if err != nil {
            log.Printf("swap: %v", err)
        }
        page.Execute(w, map[string]any{"Token": r.FormValue("t"), "Date": date, "Name": name, "Roster": everyone})
    })

    http.HandleFunc("POST /swap", func(w http.ResponseWriter, r *http.Request) {
        date, name, ok := signer.Open(r.FormValue("t"), time.Now())
        if !ok {
            http.Error(w, "This swap link has expired.", http.StatusGone)
            return
        }
        taker := r.FormValue("taker")
${checkTaker ? `        if !onRoster(roster, taker) {
            http.Error(w, "Please pick someone from the list.", http.StatusBadRequest)
            return
        }
` : ''}${checkNextTo ? `        if nextTo(shifts, date, taker) {
            http.Error(w, "They already water the day before or after. Please pick someone else.", http.StatusBadRequest)
            return
        }
` : ''}        if err := shifts.Reassign(date, name, taker); err != nil {
            log.Printf("swap %s -> %s: %v", name, taker, err)
            http.Error(w, "We couldn't make that swap. Please call Rosa.", http.StatusInternalServerError)
            return
        }
        page.Execute(w, map[string]any{"Done": true, "Date": date, "Taker": taker})
    })
}
${checkTaker ? `
// onRoster reports whether name is on the roster. remind looks every
// scheduled name up there, so a name that isn't would stop that night's run.
func onRoster(roster *store.Store, name string) bool {
    everyone, err := roster.All()
    if err != nil {
        log.Printf("swap: %v", err)
        return false
    }
    for _, v := range everyone {
        if v.Name == name {
            return true
        }
    }
    return false
}
` : ''}${checkNextTo ? `
// nextTo reports whether name already waters the day before or after date.
// A swap must not give anyone two days in a row.
func nextTo(shifts *store.Shifts, date time.Time, name string) bool {
    for _, d := range []time.Time{date.AddDate(0, 0, -1), date.AddDate(0, 0, 1)} {
        who, err := shifts.Who(d)
        if err != nil {
            log.Printf("swap: %v", err)
            return true
        }
        if who == name {
            return true
        }
    }
    return false
}
` : ''}`);

const swapHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Swap a watering shift</title>
  <style>
    body { font-family: sans-serif; font-size: 1.25rem; max-width: 32rem; margin: 2rem auto; padding: 0 1rem; }
    select, button { font-size: 1.4rem; padding: .5rem; }
  </style>
</head>
<body>
  {{if .Done}}
  <h1>All set</h1>
  <p>{{.Taker}} is watering on {{.Date.Format "Monday, January 2"}}. Thanks for finding someone!</p>
  {{else}}
  <h1>Can't make it, {{.Name}}?</h1>
  <p>Your shift is {{.Date.Format "Monday, January 2"}}. Who is taking it? Please ask them first.</p>
  <form method="post" action="/swap">
    <input type="hidden" name="t" value="{{.Token}}">
    <p><select name="taker">
      {{range .Roster}}<option>{{.Name}}</option>
      {{end}}
    </select></p>
    <p><button type="submit">Give them my shift</button></p>
  </form>
  {{end}}
</body>
</html>
`;

const sheetGo = go(`package main

import (
    "flag"
    "html/template"
    "log"
    "os"
    "time"

    "github.com/eastside-commons/seedling/internal/schedule"
    "github.com/eastside-commons/seedling/internal/store"
)

func sheet(args []string) {
    flags := flag.NewFlagSet("sheet", flag.ExitOnError)
    from := flags.String("from", "", "Monday of the week to print, YYYY-MM-DD")
    shifts := flags.String("shifts", "shifts.csv", "schedule written by export")
    flags.Parse(args)

    start, err := time.Parse("2006-01-02", *from)
    if err != nil {
        log.Fatalf("bad -from date: %v", err)
    }
    sched := store.OpenShifts(*shifts)
    var week []schedule.Shift
    for _, d := range schedule.WateringDays(start, 1) {
        name, err := sched.Who(d)
        if err != nil {
            log.Fatal(err)
        }
        week = append(week, schedule.Shift{Date: d, Volunteer: name})
    }

    page := template.Must(template.ParseFiles("templates/weekly-sheet.html"))
    if err := page.Execute(os.Stdout, map[string]any{"Week": start, "Shifts": week}); err != nil {
        log.Fatal(err)
    }
}
`);

const weeklySheetHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Watering, week of {{.Week.Format "January 2"}}</title>
  <style>
    body { font-family: sans-serif; font-size: 22pt; margin: 0.75in; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 2px solid #000; padding: 12pt; text-align: left; }
    td.initials { width: 25%; }
  </style>
</head>
<body>
  <h1>Watering: week of {{.Week.Format "January 2"}}</h1>
  <table>
    <tr><th>Day</th><th>Who is watering</th><th>Initials when done</th></tr>
    {{range .Shifts}}<tr>
      <td>{{.Date.Format "Mon Jan 2"}}</td>
      <td>{{if .Volunteer}}{{.Volunteer}}{{else}}OPEN, please call Rosa{{end}}</td>
      <td class="initials"></td>
    </tr>
    {{end}}
  </table>
  <p>Can't make your day? Use the link in your reminder email, or call Rosa.</p>
</body>
</html>
`;

const authGo = go(`package auth

import (
    "errors"

    "golang.org/x/crypto/bcrypt"
)

var ErrWrongPassword = errors.New("wrong name or password")

// Hash returns the bcrypt hash we keep in the password column of volunteers.csv.
func Hash(password string) (string, error) {
    b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
    return string(b), err
}

// Check compares a login attempt against the stored hash.
func Check(hash, password string) error {
    if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
        return ErrWrongPassword
    }
    return nil
}
`);

const cryptoGoSum = `golang.org/x/crypto v0.25.0 h1:ypSNr+bnYL2YhwoMt2zPxHFmbAN1KZs/njMG3hxUp30=
golang.org/x/crypto v0.25.0/go.mod h1:T+wALwcMOSE0kXgUAnPAHqTLW+XHgcELELW8VaDgm/M=
`;

const codeowners = `# Scheduling and reminders: Minh reviews changes here.
/internal/schedule/  @minhtran
/internal/notify/    @minhtran
/cmd/seedling/       @minhtran @tlindqvist

/docs/volunteer-handbook.md  @rosa-delgado
`;

const ciWorkflow = `name: test

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
      - run: go vet ./...
      - run: go test ./...
`;

const readme = (...parts) => parts.join('\n');

const passed = (commit, at, summary = 'go vet ./... and go test ./... passed') => ({ name: 'test', commit, at, conclusion: 'success', summary });

const R = {
  title: `# seedling

Watering schedule tools for the Eastside Commons community garden.
`,
  titleSeason2: `# seedling

Seedling runs the watering schedule for the Eastside Commons community
garden. Volunteers sign up on a web page and say which days they're free.
Seedling makes the weekly schedule, emails each volunteer the evening
before their shift, and prints a big-type schedule for the shed door.

Volunteers: start with the [volunteer handbook](docs/volunteer-handbook.md).
Everything else: [docs/index.md](docs/index.md).
`,
  nothingYet: `Nothing here yet. The first goal is to stop typing 150 dates into the
sign-up spreadsheet by hand every spring.
`,
  handbookPointer: `**Volunteers:** you probably want the [volunteer handbook](docs/volunteer-handbook.md), not this page.
`,
  needsGo: (version) => `Needs Go ${version} or newer. Standard library only.
`,
  exportSheet: (cmd) => `## Export the sign-up sheet

    go run ./cmd/seedling ${cmd}-from 2024-05-06 -weeks 4 > may.csv

Prints every watering day (Monday to Saturday) for the next four weeks as a
CSV with empty \`volunteer\` and \`notes\` columns. Import it into the sign-up
Google Sheet with File > Import.
`,
  signup: `## Sign-up website

    go run ./cmd/seedling serve -addr :8080

Volunteers enter their name, phone, email, and the weekdays they can usually
water. Each sign-up is one row in \`volunteers.csv\`, which Rosa can open in any
spreadsheet program. See [ADR-0001](docs/adr/0001-keep-the-roster-in-a-csv-file.md).
`,
  schedule: `## Make the weekly schedule

    go run ./cmd/seedling export -from 2024-06-24 > shifts.csv

Fills in who waters each day from everyone's available days. A day nobody
can take stays blank so Rosa can fill it by hand.
`,
  remindSms: `## Reminders

    go run ./cmd/seedling remind

Cron runs this at 6pm on the garden server. It texts tomorrow's volunteer
through Twilio. Set \`TWILIO_ACCOUNT_SID\`, \`TWILIO_AUTH_TOKEN\`, and
\`TWILIO_FROM\`. See [ADR-0002](docs/adr/0002-text-message-reminders.md).
`,
  remindSmsSwap: `## Reminders and swapping

    go run ./cmd/seedling remind

Cron runs this at 6pm on the garden server. It texts tomorrow's volunteer
through Twilio, with a link to hand the shift to someone else. Set
\`TWILIO_ACCOUNT_SID\`, \`TWILIO_AUTH_TOKEN\`, \`TWILIO_FROM\`, \`SEEDLING_SWAP_KEY\`,
and \`SEEDLING_URL\`. See [ADR-0002](docs/adr/0002-text-message-reminders.md)
and [ADR-0003](docs/adr/0003-swap-links-not-accounts.md).
`,
  remindEmail: `## Reminders and swapping

    go run ./cmd/seedling remind

Cron runs this at 6pm on the garden server. It emails tomorrow's volunteer
from the garden Gmail, with a link to hand the shift to someone else. Set
\`SEEDLING_SMTP_USER\`, \`SEEDLING_SMTP_PASSWORD\` (a Gmail app password, not the
account password), \`SEEDLING_SWAP_KEY\`, and \`SEEDLING_URL\`.
See [ADR-0004](docs/adr/0004-email-and-printed-sheet.md).

## Weekly sheet for the shed

    go run ./cmd/seedling sheet -from 2025-04-07 > week.html

Open week.html in a browser and print it. Rosa posts it on the shed door
every Monday.
`,
};

const adr1 = `# ADR-0001: Keep the volunteer roster in a CSV file

Status: Accepted
Date: 2024-05-12

## Context

Volunteers are moving from the shared Google Sheet to a sign-up web form.
The answers have to be stored somewhere. Rosa, the garden coordinator,
needs to read the roster and fix mistakes herself without asking a
developer. The roster is about 30 people.

## Decision

The sign-up form appends one row per volunteer to \`volunteers.csv\`:
name, phone, email, and the weekdays they can water. No database.

## Consequences

- Rosa can open and edit the roster in Google Sheets or Excel.
- Writes go through one mutex in \`internal/store\`, so two sign-ups at the
  same moment don't interleave. That only holds while there is one server
  process.
- \`volunteers.csv\` holds personal details, so it stays out of git
  (see \`.gitignore\`).
- If the roster grows past a few hundred people, revisit this.
`;

const adr2 = (status) => `# ADR-0002: Send shift reminders by text message

Status: ${status}
Date: 2024-07-23

## Context

Six shifts in June and July were missed because the volunteer forgot.
Rosa says most of the crew reads texts and ignores email. The Eastside
Neighborhood Fund gave the garden a $300 micro-grant for 2024 that can
pay for a texting service.

## Decision

Every evening \`seedling remind\` texts the next day's volunteer through
Twilio's REST API (no SDK, just \`net/http\`). The grant pays for the
Twilio number and the messages.

## Consequences

- Every volunteer needs a cell number. The sign-up form now says so.
- Twilio bills every month. When the grant runs out we either pay for it
  ourselves or change course.
- Twilio credentials live in environment variables on the garden server,
  never in git.
`;

const adr3 = `# ADR-0003: Swap shifts with a link, not volunteer accounts

Status: Accepted
Date: 2024-08-06

## Context

When volunteers can't make a shift they text Rosa, and Rosa texts around
for a sub. She asked for a way around that in discussion #5.
PR #7 tried volunteer accounts with passwords. We closed it. Many of our
volunteers won't keep track of a password, lockouts would land on Rosa
anyway, and we don't want password hashes in a file that gets opened in a
spreadsheet (ADR-0001).

## Decision

Each reminder ends with a swap link. The link carries a token for one
volunteer and one date, signed with HMAC-SHA256 (key in
\`SEEDLING_SWAP_KEY\`). Opening it shows the shift and the roster. The
volunteer picks who is taking it and \`shifts.csv\` is updated. No logins.

## Consequences

- Anyone holding the link can give away that one shift. We accept that.
- Links stop working after the shift date.
- No passwords to store, reset, or leak.
`;

const adr4 = `# ADR-0004: Email reminders and a printed weekly sheet

Status: Accepted
Date: 2025-02-09
Supersedes: ADR-0002

## Context

ADR-0002 chose text messages, paid for by the Neighborhood Fund
micro-grant. The grant ended on December 31, 2024 and will not be renewed.
Texting cost about $40 a month at the height of the season.

Several longtime volunteers told Rosa they would rather read a paper
schedule at the shed than get messages on their phones, and some never
used the swap link. See discussion #15.

## Decision

- \`seedling remind\` sends the reminder and swap link by email from the
  garden's Gmail account. Sending costs nothing.
- \`seedling sheet\` renders a large-print schedule for the week. Rosa
  prints it and posts it on the shed door every Monday.
- The Twilio code is removed and the Twilio number is cancelled.

## Consequences

- Volunteers without email rely on the printed sheet.
- The sign-up form still asks for a phone number so Rosa can call people,
  but nothing sends texts.
- No monthly bill.
`;

const handbook = ({ signup: signupPara, reminders, cantMake, heat }) => `# Volunteer handbook

Welcome to the Eastside Commons watering crew! Thank you for helping keep
the garden alive through the summer. This page is everything I tell new
volunteers on their first day, so you can look it up again later.

Rosa Delgado, garden coordinator

## Signing up

${signupPara}

## Your schedule

Every week the app makes the watering schedule from everybody's days.
It spreads shifts out so nobody does more than their share, and you'll
never get two days in a row.

## Reminders

${reminders}

## Can't make it?

${cantMake}

## On your shift

- Water early (before 9am) or in the evening (after 6pm). Never midday.
- The hose key is in the lockbox on the shed. I'll give you the code.
- Beds 1 to 12 get a deep soak. The herb spiral just needs a sprinkle.
- If the rain barrel is below the painted line, top it up from the hose.
- Close the gate behind you. The rabbits are watching.

## Heat waves

${heat}
`;

const handbookV1 = handbook({
  signup: `Go to the sign-up page and fill in your name, cell phone, email, and the
days of the week you can usually water. Pick as many days as you like.
There are no shifts on Sundays.`,
  reminders: `The evening before your shift you'll get a text from the garden's number
with the date and a link in case you can't make it.`,
  cantMake: `Tap the link in your text and pick who is taking your shift. Please ask
them first! If you can't find anybody, call me.`,
  heat: `When it's over 90 degrees I may ask for an extra evening watering. I'll
text the crew directly when that happens.`,
});

const handbookV2 = handbook({
  signup: `Go to the sign-up page and fill in your name, email, phone (optional), and
the days of the week you can usually water. Pick as many days as you like.
There are no shifts on Sundays.`,
  reminders: `The evening before your shift you'll get an email from the garden with the
date and a link in case you can't make it. We don't send texts anymore.

Not an email person? That's fine. Every Monday I post the week's schedule
on the shed door in big print. Check it when you come in, and initial your
day when you're done.`,
  cantMake: `Use the link in your reminder email and pick who is taking your shift.
Please ask them first! If you can't find anybody, call me.`,
  heat: `When it's over 90 degrees I may ask for an extra evening watering. I'll
call around when that happens.`,
});

const docsIndex = `# Seedling docs

Seedling runs the watering schedule for the Eastside Commons community garden.

## For volunteers

- [Volunteer handbook](volunteer-handbook.md): signing up, reminders, swapping a shift, what to do on your shift.
- [How scheduling works](how-scheduling-works.md): how the app decides who waters which day.

## For developers

- [README](../README.md): building and running seedling.
- Decision records, oldest first:
  - [ADR-0001](adr/0001-keep-the-roster-in-a-csv-file.md) Keep the volunteer roster in a CSV file. Accepted.
  - [ADR-0002](adr/0002-text-message-reminders.md) Send shift reminders by text message. Superseded by ADR-0004.
  - [ADR-0003](adr/0003-swap-links-not-accounts.md) Swap shifts with a link, not volunteer accounts. Accepted.
  - [ADR-0004](adr/0004-email-and-printed-sheet.md) Email reminders and a printed weekly sheet. Accepted.
`;

const howScheduling = (swaps) => `# How scheduling works

This page explains how seedling decides who waters which day. It's for
volunteers and the coordinator, so there's no code here. If you want the
code, it's in \`internal/schedule/\`.

## When the schedule gets made

Each Saturday, whoever has the garden server login runs \`seedling export\`
for the coming week. That writes the schedule to a spreadsheet file. Rosa
looks it over, fixes anything odd, and runs \`seedling sheet\` to print the
copy for the shed door.

## The rules

1. Watering days are Monday through Saturday. There are no shifts on Sundays.
2. You only get days you ticked on the sign-up form.
3. Each day goes to the free volunteer with the fewest shifts so far that week.
   If two people are tied, whoever signed up first gets it.
4. Nobody is scheduled two days in a row.
5. If nobody is left for a day, the day stays blank and Rosa finds someone.

## Reminders and swaps

${swaps}

## Who to ask

Minh Tran wrote the scheduling code. Ask him if the schedule looks wrong.
Rosa Delgado runs the schedule day to day.
`;

const swapRule = {
  anyone: `The evening before a shift, seedling emails that volunteer with a link to
swap. The link lets you hand your shift to anyone else on the roster. See
the [volunteer handbook](volunteer-handbook.md).`,
  notNextTo: `The evening before a shift, seedling emails that volunteer with a link to
swap. The link lets you hand your shift to anyone else on the roster who
isn't already watering the day before or after. See the
[volunteer handbook](volunteer-handbook.md).`,
};

const crontab = (hour) => `# seedling on the garden server. Install with: crontab deploy/crontab
# Secrets live in /srv/seedling/.env, which stays out of git.
0 ${hour} * * * cd /srv/seedling && set -a && . ./.env && ./seedling remind >> remind.log 2>&1
`;

const commandsV2 = [['export', 'print the watering sheet as CSV'], ['serve', 'run the sign-up website']];
const commandsV3 = [['export', 'make the weekly schedule as CSV'], ['serve', 'run the sign-up website and swap pages']];
const commandsV4 = [...commandsV3, ['remind', "text tomorrow's volunteer"]];
const commandsV5 = [...commandsV3, ['remind', "email tomorrow's volunteer"], ['sheet', 'print the weekly sheet for the shed door']];

const seedlingHead = 'c-cron-5pm';
const pr = (number, quote) => ({ kind: 'pr', number, quote });
const comment = (id, quote) => ({ kind: 'comment', id, quote });
const commit = (key, quote) => ({ kind: 'commit', key, quote });
const headFile = (path, quote) => ({ kind: 'file', path, at: seedlingHead, quote });
const listed = (at, eng, plain, shows) => ({ eng, plain, ev: { verb: 'files', at, shows } });
const upToDate = { eng: 'Up to date', plain: 'Up to date' };
const quiet = { count: 0, lines: 0 };
const adr = {
  roster: 'docs/adr/0001-keep-the-roster-in-a-csv-file.md',
  texts: 'docs/adr/0002-text-message-reminders.md',
  swap: 'docs/adr/0003-swap-links-not-accounts.md',
  email: 'docs/adr/0004-email-and-printed-sheet.md',
};
const handbookDoc = 'docs/volunteer-handbook.md';
const howDoc = 'docs/how-scheduling-works.md';

const views = {
  scope: 'full',
  topics: [
    {
      id: 'root',
      parent: null,
      name: { eng: 'Watering shifts', plain: 'Watering shifts' },
      core: [],
      files: [],
      start: { path: 'cmd/seedling/main.go', quote: 'const usage = `usage: seedling <command> [flags]', lines: 7 },
      docs: ['README.md', 'docs/index.md'],
      headline: [
        {
          eng: 'Seedling runs the watering schedule for the Eastside Commons community garden.',
          plain: 'Seedling runs the watering schedule for the Eastside Commons community garden.',
          ev: headFile('docs/index.md', 'Seedling runs the watering schedule for the Eastside Commons community garden.'),
        },
        {
          eng: "`export` makes the weekly schedule, `serve` runs the sign-up and swap pages, `remind` emails tomorrow's volunteer, and `sheet` prints the shed door sheet.",
          plain: "It makes the weekly schedule, runs the sign-up and swap pages, emails tomorrow's volunteer, and prints a sheet for the shed door.",
          ev: headFile('cmd/seedling/main.go', "  remind   email tomorrow's volunteer"),
        },
      ],
      example: null,
      words: ['garden', 'watering', 'volunteers', 'schedule', 'shifts'],
      covers: ['what-is-it', 'docs-map'],
    },
    {
      id: 'signup',
      parent: 'root',
      name: { eng: 'Signing up', plain: 'Signing up' },
      core: ['cmd/seedling/serve.go', 'templates/signup.html', 'internal/store/store.go'],
      files: ['cmd/seedling/serve.go', 'templates/signup.html', 'internal/store/store.go', adr.roster],
      start: { path: 'cmd/seedling/serve.go', quote: '\thttp.HandleFunc("POST /signup", func(w http.ResponseWriter, r *http.Request) {', lines: 22 },
      docs: ['README.md', handbookDoc, adr.roster],
      headline: [
        {
          eng: '`seedling serve` shows a sign-up form that asks for a name, phone, email, and weekdays from Monday to Saturday.',
          plain: 'Volunteers sign up on a web page with their name, phone, email, and the weekdays they can water.',
          ev: headFile('cmd/seedling/serve.go', 'Email: r.FormValue("email"),'),
        },
        {
          eng: 'Each sign-up is one row in volunteers.csv, which Rosa can open in any spreadsheet program.',
          plain: 'Each sign-up is one row in a file Rosa can open in any spreadsheet program.',
          ev: headFile('README.md', 'Each sign-up is one row in `volunteers.csv`, which Rosa can open in any'),
        },
      ],
      example: null,
      words: ['sign up', 'sign-up form', 'roster', 'volunteers.csv', 'phone', 'email', 'weekdays'],
    },
    {
      id: 'schedule',
      parent: 'root',
      name: { eng: 'Making the schedule', plain: 'Making the schedule' },
      core: ['internal/schedule/assign.go', 'internal/schedule/assign_test.go', 'cmd/seedling/export.go'],
      files: ['internal/schedule/assign.go', 'internal/schedule/assign_test.go', 'cmd/seedling/export.go', 'internal/store/shifts.go'],
      start: { path: 'internal/schedule/assign.go', quote: 'func Assign(days []time.Time, roster []Volunteer) []Shift {', lines: 25 },
      docs: [howDoc, handbookDoc],
      headline: [
        {
          eng: '`schedule.Assign` gives each day to the free volunteer with the fewest shifts, and ties go to roster order.',
          plain: 'Each day goes to a free volunteer with the fewest shifts, and a tie goes to whoever is first on the list.',
          ev: headFile('internal/schedule/assign.go', '// Ties go to whoever comes first in the roster.'),
        },
        {
          eng: 'It skips whoever watered the day before, and a day nobody can take stays blank.',
          plain: 'Nobody waters two days running, and a day nobody can take stays open.',
          ev: headFile('internal/schedule/assign.go', 'if last[v.Name].Equal(day.AddDate(0, 0, -1)) {'),
        },
      ],
      example: {
        eng: 'TestAssign gives Ana Monday to Saturday and Ben Monday and Tuesday, and expects Ana, Ben, Ana, blank, Ana, blank.',
        plain: "In the app's own check, Ana is free Monday to Saturday and Ben only Monday and Tuesday; Ana gets three days, Ben gets Tuesday, and two stay open.",
        ev: headFile('internal/schedule/assign_test.go', 'want := []string{"Ana", "Ben", "Ana", "", "Ana", ""}'),
      },
      words: ['schedule', 'assign', 'fewest shifts', 'tie', 'two days in a row', 'export'],
      covers: ['how-scheduler-picks', 'who-scheduling', 'example-assign-week'],
    },
    {
      id: 'days',
      parent: 'schedule',
      name: { eng: 'Watering days', plain: 'Which days get watered' },
      core: ['internal/schedule/days.go', 'internal/schedule/days_test.go'],
      files: ['internal/schedule/days.go', 'internal/schedule/days_test.go'],
      start: { path: 'internal/schedule/days.go', quote: 'func WateringDays(from time.Time, weeks int) []time.Time {', lines: 11 },
      docs: [howDoc],
      headline: [
        {
          eng: '`WateringDays` returns every day of the given weeks except Sundays.',
          plain: 'Every day of the week but Sunday is a watering day.',
          ev: headFile('internal/schedule/days.go', 'if d.Weekday() == time.Sunday {'),
        },
      ],
      example: {
        eng: 'TestWateringDays calls `WateringDays(mon, 2)` from Monday, May 6, 2024, and expects 12 days with no Sunday among them.',
        plain: "The app's own check asks for two weeks of watering days and expects 12 days, none of them a Sunday.",
        ev: headFile('internal/schedule/days_test.go', 't.Fatalf("got %d days, want 12", len(days))'),
      },
      words: ['Sunday', 'Sundays', 'watering days', 'Monday to Saturday'],
    },
    {
      id: 'reminders',
      parent: 'root',
      name: { eng: 'Reminders', plain: 'Reminders' },
      core: ['cmd/seedling/remind.go', 'internal/notify/email.go', 'deploy/crontab'],
      files: ['cmd/seedling/remind.go', 'internal/notify/email.go', 'deploy/crontab', adr.texts, adr.swap, adr.email],
      start: { path: 'cmd/seedling/remind.go', quote: 'func remind(args []string) {', lines: 38 },
      docs: ['README.md', handbookDoc, adr.swap, adr.email],
      headline: [
        {
          eng: "`seedling remind` emails tomorrow's volunteer through Gmail, with a link to hand the shift to someone else.",
          plain: "The app emails tomorrow's volunteer a reminder with a link to hand the shift to someone else.",
          ev: headFile('cmd/seedling/remind.go', 'Addr:     "smtp.gmail.com:587",'),
        },
        {
          eng: 'A volunteer with no email on file gets no reminder.',
          plain: 'A volunteer with no email on file gets no reminder.',
          ev: headFile('cmd/seedling/remind.go', 'log.Printf("%s has no email on file, skipping", v.Name)'),
        },
        {
          eng: 'deploy/crontab runs it every day at 17:00.',
          plain: 'It runs every day at 5pm.',
          ev: headFile('deploy/crontab', '0 17 * * * cd /srv/seedling && set -a && . ./.env && ./seedling remind >> remind.log 2>&1'),
        },
      ],
      example: null,
      words: ['remind', 'reminder', 'email', 'text message', 'Twilio', 'Gmail', 'cron', '5pm'],
    },
    {
      id: 'shed-sheet',
      parent: 'reminders',
      name: { eng: 'Shed door sheet', plain: 'The sheet on the shed door' },
      core: ['cmd/seedling/sheet.go', 'templates/weekly-sheet.html'],
      files: ['cmd/seedling/sheet.go', 'templates/weekly-sheet.html'],
      start: { path: 'cmd/seedling/sheet.go', quote: 'func sheet(args []string) {', lines: 25 },
      docs: ['README.md', adr.email],
      headline: [
        {
          eng: 'The weekly sheet is a large-print table of each day, who is watering, and a column for initials when done.',
          plain: 'The weekly sheet is a big-print table of each day, who is watering, and a space to initial when done.',
          ev: headFile('templates/weekly-sheet.html', '<tr><th>Day</th><th>Who is watering</th><th>Initials when done</th></tr>'),
        },
        {
          eng: 'A day with nobody on it reads OPEN, please call Rosa.',
          plain: 'A day with nobody on it tells people to call Rosa.',
          ev: headFile('templates/weekly-sheet.html', '<td>{{if .Volunteer}}{{.Volunteer}}{{else}}OPEN, please call Rosa{{end}}</td>'),
        },
      ],
      example: null,
      words: ['sheet', 'shed', 'print', 'paper schedule', 'initials'],
    },
    {
      id: 'swap',
      parent: 'root',
      name: { eng: 'Swapping a shift', plain: 'Handing off a shift' },
      core: ['cmd/seedling/swap.go', 'internal/swap/swap.go', 'internal/swap/swap_test.go', 'templates/swap.html'],
      files: ['cmd/seedling/swap.go', 'internal/swap/swap.go', 'internal/swap/swap_test.go', 'templates/swap.html', adr.swap],
      start: { path: 'cmd/seedling/swap.go', quote: '\thttp.HandleFunc("POST /swap", func(w http.ResponseWriter, r *http.Request) {', lines: 22 },
      docs: [howDoc, handbookDoc, adr.swap],
      headline: [
        {
          eng: 'A swap link is signed for one volunteer and one date, and stops working after that date.',
          plain: "Each swap link is for one person's shift on one day, and stops working after that day.",
          ev: headFile('internal/swap/swap.go', 'if err != nil || date.Before(now.Truncate(24*time.Hour)) {'),
        },
        {
          eng: 'The swap page refuses anyone not on the roster or already watering the day before or after.',
          plain: 'The swap page refuses anyone not on the volunteer list or already watering the day before or after.',
          ev: headFile('cmd/seedling/swap.go', 'if nextTo(shifts, date, taker) {'),
        },
      ],
      example: {
        eng: "TestTokenRoundTrip expects Walt's link for Thursday, August 8, 2024 to work that day, and to fail the day after or under another key.",
        plain: "The app's own check expects Walt's link for his Thursday shift to work that Thursday and stop working on Friday.",
        ev: headFile('internal/swap/swap_test.go', 't.Error("token still works the day after the shift")'),
      },
      words: ['swap', 'hand off', 'link', 'token', 'trade shifts', 'sub'],
      covers: ['example-swap-link-expiry'],
    },
  ],
  changes: {
    'c-init': {
      topics: [],
      routine: [
        {
          files: ['.gitignore', 'README.md', 'go.mod'],
          name: { eng: 'project start', plain: 'project start' },
          reason: listed('c-init', 'Only a README, go.mod, and a .gitignore, no code yet.', 'Only a front page and two setup files, no code yet.', '.gitignore (new); README.md (new); go.mod (new)'),
        },
      ],
    },
    'pr#1': { topics: ['days'] },
    'c-weekday': { topics: [] },
    'c-ci': {
      topics: [],
      routine: [
        {
          files: ['.github/workflows/test.yml'],
          name: { eng: 'test workflow added', plain: 'automatic checks added' },
          reason: listed('c-ci', 'Only a new workflow, .github/workflows/test.yml, was added.', 'Only a new setup for automatic checks was added, nothing in the app.', '.github/workflows/test.yml (new)'),
        },
      ],
    },
    'pr#2': { topics: ['signup', 'schedule'] },
    'c-typo': {
      topics: ['signup'],
      routine: [
        {
          files: ['templates/signup.html'],
          name: { eng: 'thank-you typo', plain: 'spelling fix' },
          reason: { eng: 'One line in one file changed.', plain: 'Only one line changed.', ev: { verb: 'diff', from: 'merge-pr-2', to: 'c-typo', shows: '1 file changed, 1 insertion(+), 1 deletion(-)' } },
        },
      ],
    },
    'pr#4': {
      topics: ['schedule'],
      findings: [
        {
          id: 'f-notes-dropped',
          severity: 'check',
          topics: ['schedule'],
          anchors: [
            { kind: 'file', path: 'cmd/seedling/export.go', at: 'c-export-assign', quote: 'w.Write([]string{"date", "day", "volunteer"})' },
            { kind: 'file', path: 'cmd/seedling/export.go', at: 'c-serve', quote: 'w.Write([]string{"date", "day", "volunteer", "notes"})' },
          ],
          name: { eng: 'The export dropped its notes column', plain: 'The schedule file lost its notes column' },
          says: [
            {
              eng: 'cmd/seedling/export.go wrote a header of date, day, volunteer, and notes.',
              plain: 'The sheet the app printed had a column for notes.',
              ev: { kind: 'file', path: 'cmd/seedling/export.go', at: 'c-serve', quote: 'w.Write([]string{"date", "day", "volunteer", "notes"})' },
            },
            {
              eng: 'cmd/seedling/export.go now writes date, day, and volunteer, with no notes column.',
              plain: 'The schedule file now has no column for notes.',
              ev: headFile('cmd/seedling/export.go', 'w.Write([]string{"date", "day", "volunteer"})'),
            },
          ],
          why: { notRecorded: { ask: ['minhtran'] } },
        },
      ],
    },
    'c-no-repeat': { topics: ['schedule'] },
    'pr#8': { topics: ['reminders'] },
    'pr#10': {
      topics: ['swap', 'reminders'],
      findings: [
        {
          id: 'f-swap-two-days',
          severity: 'check',
          topics: ['swap'],
          anchors: [
            { kind: 'file', path: 'cmd/seedling/swap.go', at: 'c-swap-taker', quote: 'if !onRoster(roster, taker) {' },
            commit('c-swap-adjacent', 'but the swap page would hand a shift to someone who already waters the day'),
          ],
          name: { eng: 'A swap could give someone two days in a row', plain: 'Handing off a shift could give someone two days in a row' },
          says: [
            {
              eng: 'Minh Tran wrote that the swap page would hand a shift to someone who already waters the day before or after.',
              plain: 'Minh Tran wrote that the swap page used to give a shift to someone already watering the day before or after.',
              ev: commit('c-swap-adjacent', 'but the swap page would hand a shift to someone who already waters the day'),
            },
          ],
          why: { notRecorded: { ask: ['tlindqvist'] } },
        },
        {
          id: 'f-swap-order',
          severity: 'check',
          topics: ['swap'],
          anchors: [
            { kind: 'file', path: 'templates/swap.html', at: 'c-swap-taker', quote: '{{range .Roster}}<option>{{.Name}}</option>' },
            { kind: 'issue', number: 11, quote: 'Could the names go in ABC order like a phone book?' },
          ],
          name: { eng: 'Names on the swap page are in sign-up order', plain: 'Names on the hand-off page are in sign-up order, not ABC order' },
          says: [
            {
              eng: 'The swap page lists names in the order people signed up.',
              plain: 'The swap page lists names in the order people signed up.',
              ev: comment('issue11-minh', "They're in the order people signed up"),
            },
            {
              eng: 'The v1.0.0 release notes list the sign-up order of names on the swap page under Known issues.',
              plain: 'The season 2 release notes list the order of names on the swap page as a known problem.',
              ev: { kind: 'tag', name: 'v1.0.0', quote: 'Names on the swap page are in sign-up order, not alphabetical (#11).' },
            },
          ],
          why: { notRecorded: { ask: ['tlindqvist'] } },
          covers: ['open-swap-names'],
        },
      ],
    },
    'pr#12': {
      topics: [],
      routine: [
        {
          files: [handbookDoc],
          name: { eng: 'volunteer handbook', plain: 'volunteer handbook' },
          reason: listed('merge-pr-12', 'Only a new page, docs/volunteer-handbook.md, was added.', 'Only a new handbook page was added.', 'docs/volunteer-handbook.md (new)'),
        },
      ],
    },
    'c-readme-handbook': {
      topics: [],
      routine: [
        {
          files: ['README.md'],
          name: { eng: 'README points to the handbook', plain: 'link to the handbook' },
          reason: listed('c-readme-handbook', 'Only README.md changed.', 'Only the front page changed.', 'README.md'),
        },
      ],
    },
    'c-codeowners': {
      topics: [],
      routine: [
        {
          files: ['.github/CODEOWNERS'],
          name: { eng: 'CODEOWNERS added', plain: 'reviewer list added' },
          reason: listed('c-codeowners', 'Only .github/CODEOWNERS, the list of reviewers, was added.', 'Only the list of who reviews what was added.', '.github/CODEOWNERS (new)'),
        },
      ],
    },
    'c-go123': { topics: [] },
    'pr#16': { topics: ['reminders', 'shed-sheet', 'signup'] },
    'pr#17': {
      topics: [],
      routine: [
        {
          files: ['README.md', howDoc, 'docs/index.md'],
          name: { eng: 'season 2 docs', plain: 'season 2 guides' },
          reason: listed('merge-pr-17', 'Only README.md and two new pages in docs/ changed.', 'Only the front page and two new guide pages changed.', 'README.md; docs/how-scheduling-works.md (new); docs/index.md (new)'),
        },
      ],
    },
    'pr#18': {
      topics: [],
      routine: [
        {
          files: [handbookDoc],
          name: { eng: 'handbook update', plain: 'handbook update' },
          reason: listed('merge-pr-18', 'Only docs/volunteer-handbook.md changed.', 'Only the handbook page changed.', 'docs/volunteer-handbook.md'),
        },
      ],
    },
    'c-swap-adjacent': { topics: ['swap'] },
    'c-cron-5pm': { topics: ['reminders'] },
  },
  decisions: [
    {
      id: 'd-remind-5pm',
      what: {
        eng: "Tobias Lindqvist changed the crontab's reminder time to 5pm.",
        plain: 'Tobias Lindqvist changed the reminder time to 5pm.',
        ev: commit('c-cron-5pm', 'crontab: remind at 5pm'),
      },
      topics: ['reminders'],
      carriedBy: 'c-cron-5pm',
      why: { notRecorded: { ask: ['tlindqvist'] } },
      covers: ['reminder-5pm-why-gap'],
    },
    {
      id: 'd-swap-adjacent',
      what: {
        eng: 'The swap page will not hand a shift to someone on the day before or after.',
        plain: 'The hand-off page refuses someone who already waters the day before or after.',
        ev: commit('c-swap-adjacent', "swap: don't hand a shift to someone on the day before or after"),
      },
      topics: ['swap'],
      carriedBy: 'c-swap-adjacent',
      why: {
        reason: {
          eng: 'The scheduler never gives anyone two days in a row, and the handbook says so.',
          plain: 'The schedule never gives anyone two days in a row, and the handbook promises that.',
          ev: commit('c-swap-adjacent', 'The scheduler never gives anyone two days in a row and the handbook says so,'),
        },
      },
    },
    {
      id: 'd-email',
      what: {
        eng: '`seedling remind` sends the reminder and swap link by email through the garden Gmail.',
        plain: "Reminders go out by email from the garden's account, with the hand-off link.",
        ev: headFile(adr.email, '`seedling remind` sends the reminder and swap link by email from the'),
      },
      alsoIntent: [pr(16, "`seedling remind` now emails tomorrow's volunteer (with the swap link) through the garden Gmail.")],
      topics: ['reminders'],
      carriedBy: 'pr#16',
      why: {
        reason: {
          eng: 'The grant that paid for texting ended on December 31, 2024 and will not be renewed.',
          plain: 'The grant that paid for text messages ended on December 31, 2024 and will not be renewed.',
          ev: headFile(adr.email, 'The grant ended on December 31, 2024 and will not be renewed.'),
        },
      },
      covers: ['texts-dropped', 'notified-now', 'decisions-current', 'growth-arc'],
    },
    {
      id: 'd-shed-sheet',
      what: {
        eng: '`seedling sheet` makes a large-print weekly schedule for the shed door.',
        plain: 'The app makes a big-letter weekly schedule for the shed door.',
        ev: headFile(adr.email, '`seedling sheet` renders a large-print schedule for the week.'),
      },
      alsoIntent: [pr(16, 'New `seedling sheet -from <monday>` prints a big-type weekly schedule for the shed door.')],
      topics: ['shed-sheet'],
      carriedBy: 'pr#16',
      why: {
        reason: {
          eng: 'Several longtime volunteers told Rosa they would rather read a paper schedule at the shed than get messages on their phones.',
          plain: 'Several longtime volunteers told Rosa they would rather read a paper schedule at the shed than get messages on their phones.',
          ev: headFile(adr.email, 'Several longtime volunteers told Rosa they would rather read a paper'),
        },
      },
      covers: ['notified-now'],
    },
    {
      id: 'd-keep-phone',
      what: {
        eng: "Rosa Delgado decided to keep collecting volunteers' phone numbers.",
        plain: "Rosa Delgado decided to keep collecting volunteers' phone numbers.",
        ev: comment('disc15-rosa-2', 'Yes keep phones'),
      },
      topics: ['signup'],
      carriedBy: 'pr#16',
      why: {
        reason: {
          eng: 'Rosa still calls people when there is a heat wave.',
          plain: 'Rosa still calls people when there is a heat wave.',
          ev: comment('disc15-rosa-2', 'I still call people when there is a heat wave.'),
        },
      },
    },
    {
      id: 'd-go123',
      what: {
        eng: 'Tobias Lindqvist moved the project to Go version 1.23.',
        plain: "Tobias Lindqvist changed the app's Go version to 1.23.",
        ev: commit('c-go123', 'go 1.23'),
      },
      topics: ['root'],
      carriedBy: 'c-go123',
      why: { notRecorded: { ask: ['tlindqvist'] } },
      covers: ['go-123-why-gap'],
    },
    {
      id: 'd-swap-link',
      what: {
        eng: 'Each reminder carries a link to hand that shift to someone else.',
        plain: 'Every reminder has a link for handing the shift to someone else.',
        ev: headFile(adr.swap, 'Each reminder ends with a swap link.'),
      },
      alsoIntent: [pr(10, 'every reminder text ends with a link')],
      topics: ['swap', 'reminders'],
      carriedBy: 'pr#10',
      why: {
        reason: {
          eng: 'Rosa asked for a way for volunteers to trade shifts without going through her.',
          plain: 'Rosa asked for a way for volunteers to trade shifts without going through her.',
          ev: pr(10, 'Rosa asked for a way for volunteers to trade shifts without going through her (discussion #5).'),
        },
      },
      covers: ['swap-from-coordinator', 'decisions-current', 'growth-arc'],
    },
    {
      id: 'd-roster-check',
      what: {
        eng: 'The swap page only hands a shift to someone on the roster.',
        plain: 'A shift can only be handed to someone on the volunteer list.',
        ev: commit('c-swap-taker', 'swap: only hand a shift to someone on the roster'),
      },
      alsoIntent: [comment('pr10-thread-tobias-taker', 'POST /swap only accepts names on the roster now')],
      topics: ['swap'],
      carriedBy: 'pr#10',
      why: {
        reason: {
          eng: "A name that isn't in volunteers.csv would make the reminder run fail the next evening.",
          plain: "A name missing from the volunteer list would make the next evening's reminders fail.",
          ev: commit('c-swap-taker', "A name that isn't in volunteers.csv would make remind fail the next"),
        },
      },
      covers: ['review-roster-check'],
    },
    {
      id: 'd-no-heat-texts',
      what: {
        eng: 'The app will not text the whole crew at once when it is hot.',
        plain: 'Rosa will keep texting the crew herself on hot days, instead of the app texting everyone at once.',
        ev: comment('issue9-rosa-2', "I'll keep texting the crew myself when it's hot"),
      },
      topics: ['reminders'],
      carriedBy: null,
      why: {
        reason: {
          eng: 'People answer Rosa faster, and the grant money is saved for the reminders.',
          plain: 'People answer Rosa faster, and the grant money is saved for the reminders.',
          ev: comment('issue9-rosa-2', 'people answer me faster anyway'),
        },
      },
      covers: ['declined-heat-wave-text'],
    },
    {
      id: 'd-texts',
      what: {
        eng: "`seedling remind` texts tomorrow's volunteer through Twilio.",
        plain: "The app sends tomorrow's volunteer a text message reminder.",
        ev: headFile(adr.texts, "Every evening `seedling remind` texts the next day's volunteer through"),
      },
      alsoIntent: [pr(8, 'It looks up tomorrow in shifts.csv and texts that volunteer through Twilio')],
      topics: ['reminders'],
      carriedBy: 'pr#8',
      replacedBy: 'd-email',
      why: {
        reason: {
          eng: 'Six shifts in June and July were missed because the volunteer forgot.',
          plain: 'Six shifts in June and July were missed because the volunteer forgot.',
          ev: headFile(adr.texts, 'Six shifts in June and July were missed because the volunteer forgot.'),
        },
      },
      covers: ['texts-adopted', 'decisions-current', 'growth-arc'],
    },
    {
      id: 'd-no-accounts',
      what: {
        eng: 'Tobias Lindqvist closed PR #7, volunteer accounts with passwords.',
        plain: 'Tobias Lindqvist dropped volunteer logins with passwords.',
        ev: comment('pr7-tobias', 'Closing this.'),
      },
      topics: ['swap'],
      carriedBy: null,
      why: {
        reason: {
          eng: 'Rosa Delgado said a password would be a dealbreaker for a lot of the crew, and people locked out would text her anyway.',
          plain: 'Rosa Delgado said a password would be a dealbreaker for a lot of the crew, and people locked out would text her anyway.',
          ev: comment('pr7-rosa', 'a password is going to be a dealbreaker for a lot of our crew'),
        },
      },
      covers: ['accounts-closed'],
    },
    {
      id: 'd-no-repeat',
      what: {
        eng: 'The scheduler should skip anyone who watered the day before.',
        plain: 'The schedule should not give anyone the day after a day they watered.',
        ev: commit('c-no-repeat', 'schedule: skip anyone who watered the day before'),
      },
      alsoIntent: [comment('pr4-thread-minh', 'skip anyone who had the day before, and leave the day blank if nobody is left')],
      topics: ['schedule'],
      carriedBy: 'c-no-repeat',
      why: {
        reason: {
          eng: 'Last summer people worked four and five days straight, and two of the best burned out by mid-July and never came back.',
          plain: 'Last summer people watered four and five days straight, and two of the best burned out by mid-July and never came back.',
          ev: comment('pr4-thread-rosa', 'two of our best people burned out by mid-July and never came back'),
        },
      },
      covers: ['no-back-to-back', 'docs-back-to-back-gap'],
    },
    {
      id: 'd-auto-schedule',
      what: {
        eng: "The weekly schedule is filled in automatically from everyone's available days.",
        plain: 'The app now makes the weekly schedule from the days each volunteer is free.',
        ev: pr(4, "Automatic weekly schedule from everyone's available days"),
      },
      topics: ['schedule'],
      carriedBy: 'pr#4',
      why: {
        reason: {
          eng: 'Rosa was building the weekly schedule by hand from volunteers.csv.',
          plain: 'Rosa was making the weekly schedule by hand from the volunteer list.',
          ev: pr(4, 'Right now Rosa builds the weekly schedule by hand from volunteers.csv.'),
        },
      },
      covers: ['growth-arc'],
    },
    {
      id: 'd-signup-site',
      what: {
        eng: 'Volunteers sign up on a website that replaces the shared spreadsheet.',
        plain: 'Volunteers sign up on a web page instead of the shared spreadsheet.',
        ev: pr(2, 'Sign-up website (replaces the shared spreadsheet)'),
      },
      topics: ['signup'],
      carriedBy: 'pr#2',
      why: {
        reason: {
          eng: 'Rosa Delgado said the old Google Form was impossible for some of the volunteers.',
          plain: 'Rosa Delgado said the old sign-up form was impossible for some of the volunteers.',
          ev: comment('pr2-rosa', 'The old Google Form was impossible for some of our folks.'),
        },
      },
      covers: ['growth-arc'],
    },
    {
      id: 'd-big-type',
      what: {
        eng: 'The sign-up page uses big fonts and big buttons on purpose.',
        plain: 'The sign-up page uses big letters and big buttons on purpose.',
        ev: pr(2, 'Big fonts and big buttons on purpose'),
      },
      topics: ['signup'],
      carriedBy: 'pr#2',
      why: {
        reason: {
          eng: 'Most of the crew will sign up on a phone.',
          plain: 'Most of the crew will sign up on a phone.',
          ev: pr(2, 'most of the crew will do this on a phone'),
        },
      },
    },
    {
      id: 'd-csv-roster',
      what: {
        eng: 'Each sign-up is appended to volunteers.csv.',
        plain: 'Each sign-up is added as a new row in one file.',
        ev: headFile(adr.roster, 'The sign-up form appends one row per volunteer to `volunteers.csv`:'),
      },
      alsoIntent: [pr(2, 'Each sign-up is appended to volunteers.csv.')],
      topics: ['signup'],
      carriedBy: 'pr#2',
      why: {
        reason: {
          eng: 'Rosa, the garden coordinator, needs to read the roster and fix mistakes herself without asking a developer.',
          plain: 'Rosa, the garden coordinator, needs to read the list and fix mistakes herself without asking a programmer.',
          ev: headFile(adr.roster, 'needs to read the roster and fix mistakes herself without asking a'),
        },
      },
      covers: ['roster-csv', 'decisions-current'],
    },
    {
      id: 'd-subcommands',
      what: {
        eng: '`seedling -from ...` became `seedling export -from ...`.',
        plain: 'The command that used to take only a start date now starts with the word export.',
        ev: pr(2, 'The old `seedling -from ...` is now `seedling export -from ...`'),
      },
      topics: ['schedule'],
      carriedBy: 'pr#2',
      why: { notRecorded: { ask: ['minhtran'] } },
    },
    {
      id: 'd-day-column',
      what: {
        eng: 'A day-of-week column was added for Rosa.',
        plain: 'A column with the day of the week was added for Rosa.',
        ev: commit('c-weekday', 'add day-of-week column (rosa)'),
      },
      topics: ['root'],
      carriedBy: 'c-weekday',
      why: {
        reason: {
          eng: 'Rosa Delgado asked for the day of the week next to the date, because people think in Tuesdays, not 5/14.',
          plain: 'Rosa Delgado asked for the weekday next to each date, because people think in weekdays, not dates.',
          ev: comment('pr1-rosa', 'People think in Tuesdays, not 5/14.'),
        },
      },
    },
    {
      id: 'd-sheet-export',
      what: {
        eng: '`seedling` prints every watering day as CSV with empty volunteer and notes columns.',
        plain: 'The app prints every watering day as a spreadsheet with empty columns for volunteers and notes.',
        ev: pr(1, 'prints every watering day (Mon-Sat) as CSV with empty volunteer/notes columns'),
      },
      topics: ['root'],
      carriedBy: 'pr#1',
      replacedBy: 'd-auto-schedule',
      why: {
        reason: {
          eng: 'Rosa imports the CSV into the sign-up Google Sheet instead of typing the dates in by hand like last year.',
          plain: 'Rosa loads the dates into the sign-up spreadsheet instead of typing them in by hand like last year.',
          ev: pr(1, 'Rosa imports that into the sign-up Google Sheet instead of typing the dates in by hand like last year.'),
        },
      },
      covers: ['growth-arc'],
    },
    {
      id: 'd-no-sundays',
      what: {
        eng: 'There are no watering shifts on Sundays.',
        plain: 'Nobody is scheduled to water on Sundays.',
        ev: comment('disc3-rosa', 'so we just said no Sunday shifts at all.'),
      },
      topics: ['days'],
      carriedBy: 'pr#1',
      why: {
        reason: {
          eng: "Pastor Ruth asked for quiet Sunday mornings when the garden leased its lot from Grace Lutheran, and Rosa didn't want to police a Sunday-afternoons-only rule.",
          plain: "The church next door, which rents the garden its land, asked for quiet Sunday mornings, and Rosa didn't want to police an afternoons-only rule.",
          ev: comment('disc3-rosa', "We could have done 'Sunday afternoons only' but I didn't want to be the one policing that"),
        },
      },
      covers: ['no-sundays-why', 'docs-sunday-gap'],
    },
    {
      id: 'd-stdlib',
      what: {
        eng: 'seedling uses no dependencies, only the Go standard library.',
        plain: 'The app uses nothing beyond the tools that come with Go.',
        ev: pr(1, 'No deps, stdlib only.'),
      },
      topics: ['root'],
      carriedBy: 'pr#1',
      why: { notRecorded: { ask: ['minhtran'] } },
    },
  ],
  claims: [
    {
      id: 'claim-stdlib',
      doc: 'README.md',
      quote: 'Standard library only.',
      topic: 'root',
      verdict: 'still-true',
      covers: ['currency-stdlib-only'],
    },
    {
      id: 'claim-6pm',
      doc: 'README.md',
      quote: 'Cron runs this at 6pm on the garden server.',
      topic: 'reminders',
      verdict: 'no-longer-true',
      brokenBy: 'c-cron-5pm',
      why: {
        eng: 'deploy/crontab runs `seedling remind` at 17:00, which is 5pm.',
        plain: 'The server now sends reminders at 5pm.',
        ev: headFile('deploy/crontab', '0 17 * * * cd /srv/seedling && set -a && . ./.env && ./seedling remind >> remind.log 2>&1'),
      },
      covers: ['currency-reminder-6pm'],
    },
    {
      id: 'claim-two-days',
      doc: handbookDoc,
      quote: "It spreads shifts out so nobody does more than their share, and you'll\nnever get two days in a row.",
      topic: 'schedule',
      verdict: 'true-since',
      since: 'c-swap-adjacent',
      why: {
        eng: 'The check `if nextTo(shifts, date, taker) {` went into cmd/seedling/swap.go on 2025-03-26, in a commit by Minh Tran.',
        plain: 'The swap page started refusing someone who waters the day before or after on Mar 26, 2025, in a change by Minh Tran.',
        ev: { verb: 'introduced', path: 'cmd/seedling/swap.go', needle: 'if nextTo(shifts, date, taker) {', shows: 'by Minh Tran' },
      },
      covers: ['currency-two-days-in-a-row'],
    },
    {
      id: 'claim-sundays',
      doc: howDoc,
      quote: 'Watering days are Monday through Saturday. There are no shifts on Sundays.',
      topic: 'days',
      verdict: 'still-true',
    },
    {
      id: 'claim-swap-rule',
      doc: howDoc,
      quote: "The link lets you hand your shift to anyone else on the roster who\nisn't already watering the day before or after.",
      topic: 'swap',
      verdict: 'still-true',
    },
    {
      id: 'claim-adr-swap-link',
      doc: adr.swap,
      quote: 'Each reminder ends with a swap link.',
      topic: 'swap',
      verdict: 'no-longer-true',
      brokenBy: 'pr#16',
      why: {
        eng: 'cmd/seedling/remind.go writes the swap link before the closing "Thank you!" and "The garden crew" lines.',
        plain: 'The reminder email ends with a thank-you from the garden crew, after the swap link.',
        ev: headFile('cmd/seedling/remind.go', '"Can\'t make it? Hand your shift to someone else here:\\n%s\\n\\nThank you!\\nThe garden crew\\n",'),
      },
    },
    {
      id: 'claim-adr-swap-pick',
      doc: adr.swap,
      quote: 'The\nvolunteer picks who is taking it and `shifts.csv` is updated.',
      topic: 'swap',
      verdict: 'depends',
      brokenBy: 'c-swap-adjacent',
      why: {
        eng: 'cmd/seedling/swap.go refuses a taker who already waters the day before or after, and returns before it reassigns the shift.',
        plain: 'The hand-off page turns down someone who already waters the day before or after, and the shift stays as it was.',
        ev: headFile('cmd/seedling/swap.go', 'http.Error(w, "They already water the day before or after. Please pick someone else.", http.StatusBadRequest)'),
      },
    },
    {
      id: 'claim-weekly-count',
      doc: howDoc,
      quote: 'Each day goes to the free volunteer with the fewest shifts so far that week.',
      topic: 'schedule',
      verdict: 'depends',
      brokenBy: 'pr#17',
      why: {
        eng: '`schedule.Assign` starts its shift counts once for all the days it is given and never resets them by week.',
        plain: "The app counts each person's shifts across all the days it schedules at once, not week by week.",
        ev: headFile('internal/schedule/assign.go', 'count := map[string]int{}'),
      },
    },
    {
      id: 'claim-no-repeat-rule',
      doc: howDoc,
      quote: 'Nobody is scheduled two days in a row.',
      topic: 'schedule',
      verdict: 'still-true',
    },
  ],
  undone: [],
  runs: [],
  screens: [
    { kind: 'page', topic: 'root', status: upToDate },
    { kind: 'page', topic: 'signup', status: upToDate },
    { kind: 'page', topic: 'schedule', status: { eng: 'Out of date since PR #17, Mar 4, 2025', plain: 'Out of date since Mar 4, 2025' } },
    { kind: 'page', topic: 'days', status: upToDate },
    { kind: 'page', topic: 'reminders', status: { eng: 'Out of date since commit a41783c, Mar 29, 2025', plain: 'Out of date since Mar 29, 2025' } },
    { kind: 'page', topic: 'shed-sheet', status: upToDate },
    { kind: 'page', topic: 'swap', status: { eng: 'Out of date since PR #16, Feb 15, 2025', plain: 'Out of date since Feb 15, 2025' } },
    {
      kind: 'timeline',
      topic: 'root',
      from: '2024-04-06',
      to: '2025-03-29',
      counts: { decision: 21, check: 3 },
      named: ['d-remind-5pm', 'f-swap-two-days', 'd-swap-adjacent'],
      routine: { count: 8, lines: 156 },
    },
    {
      kind: 'timeline',
      topic: 'reminders',
      from: '2024-04-06',
      to: '2025-03-29',
      counts: { decision: 5 },
      named: ['d-remind-5pm', 'd-email', 'd-swap-link'],
      routine: quiet,
    },
    {
      kind: 'timeline',
      topic: 'signup',
      from: '2024-04-06',
      to: '2025-03-29',
      counts: { decision: 4 },
      named: ['d-keep-phone', 'd-signup-site', 'd-big-type'],
      routine: { count: 1, lines: 2 },
    },
    {
      kind: 'timeline',
      topic: 'root',
      from: '2024-07-01',
      to: '2024-08-31',
      counts: { decision: 6, check: 2 },
      named: ['d-swap-link', 'f-swap-two-days', 'd-roster-check'],
      routine: quiet,
    },
    {
      kind: 'timeline',
      topic: 'root',
      from: '2025-03-01',
      to: '2025-03-29',
      counts: { decision: 2 },
      named: ['d-remind-5pm', 'd-swap-adjacent'],
      routine: { count: 2, lines: 75 },
    },
  ],
  uncovered: [
    { key: 'winter-lull', why: 'Discussions #14 and #15, where season 1 closes and season 2 planning starts, are not view objects. Between them the timeline shows only d-go123.' },
    { key: 'handbook-caught-up', why: 'v1 shows whether a doc is true today. The weeks the handbook still promised a text after PR #16 are history that no view object holds, and PR #18 shows only as a routine handbook update.' },
    { key: 'ci-caught-tie', why: 'Test runs inside a pull request are not view objects. PR #4 shows only as the decision it carries.' },
  ],
};

/** @type {import('../schema.mjs').RepoSpec} */
const spec = {
  slug: 'seedling',
  name: 'Seedling',
  owner: 'eastside-commons',
  about: 'Watering shift sign-ups and reminders for the Eastside Commons garden.',
  description:
    'A small volunteer-built Go web app that schedules watering shifts for the Eastside Commons community garden and reminds volunteers. Two developers, a garden coordinator, and a volunteer, April 2024 to March 2025.',
  people: {
    minhtran: { name: 'Minh Tran', email: '48213907+minhtran@users.noreply.github.com', role: 'lead developer; wrote and owns the scheduling logic' },
    tlindqvist: { name: 'Tobias Lindqvist', email: 'tobias.lindqvist@fastmail.com', role: 'occasional developer, evenings and weekends' },
    'rosa-delgado': { name: 'Rosa Delgado', email: '91550312+rosa-delgado@users.noreply.github.com', role: 'garden coordinator; not a developer' },
    waltb: { name: 'Walt Brennan', email: '30117745+waltb@users.noreply.github.com', role: 'volunteer waterer; not a developer' },
  },
  steps: [
    {
      type: 'commit',
      key: 'c-init',
      at: '2024-04-06T15:12:00Z',
      author: 'minhtran',
      message: 'Initial commit',
      files: {
        'README.md': readme(R.title, R.nothingYet),
        'go.mod': gomod('1.22'),
        '.gitignore': gitignore,
      },
    },
    {
      type: 'pr',
      number: 1,
      title: 'Export the watering sign-up sheet as CSV',
      author: 'minhtran',
      body: `First real piece of seedling.

\`go run ./cmd/seedling -from 2024-05-06 -weeks 4 > may.csv\` prints every watering day (Mon-Sat) as CSV with empty volunteer/notes columns. Rosa imports that into the sign-up Google Sheet instead of typing the dates in by hand like last year.

No deps, stdlib only.`,
      labels: ['feature'],
      requestedReviewers: ['tlindqvist'],
      branch: 'csv-export',
      openedAt: '2024-04-13T18:02:00Z',
      commits: [
        {
          key: 'c-export',
          at: '2024-04-13T18:05:00Z',
          author: 'minhtran',
          message: 'Export watering days as CSV',
          files: {
            'cmd/seedling/main.go': mainGoV1('"date", "volunteer", "notes"', 'd.Format("2006-01-02"), "", ""'),
            'internal/schedule/days.go': daysGo,
            'README.md': readme(R.title, R.needsGo('1.22'), R.exportSheet('')),
          },
        },
        {
          key: 'c-export-test',
          at: '2024-04-14T20:41:00Z',
          author: 'minhtran',
          message: 'test WateringDays',
          files: {
            'internal/schedule/days_test.go': daysTestGo,
          },
        },
      ],
      reviews: [
        {
          id: 'pr1-rv-tobias',
          author: 'tlindqvist',
          at: '2024-04-16T02:14:00Z',
          state: 'APPROVED',
          body: 'Nice and small. Ran it for May, 24 rows, matches the paper calendar. lgtm',
          threads: [],
        },
      ],
      comments: [
        {
          id: 'pr1-rosa',
          author: 'rosa-delgado',
          at: '2024-04-17T13:30:00Z',
          body: "This is going to save me a whole evening, thank you Minh! One request. Could the sheet show the day of the week next to the date? People think in Tuesdays, not 5/14.",
        },
        {
          id: 'pr1-minh',
          author: 'minhtran',
          at: '2024-04-17T22:05:00Z',
          body: "yep, easy. I'll add it right after this goes in.",
        },
      ],
      outcome: { kind: 'merged', at: '2024-04-20T16:45:00Z', by: 'minhtran' },
    },
    {
      type: 'commit',
      key: 'c-weekday',
      at: '2024-04-21T17:20:00Z',
      author: 'minhtran',
      message: 'add day-of-week column (rosa)',
      files: {
        'cmd/seedling/main.go': mainGoV1('"date", "day", "volunteer", "notes"', 'd.Format("2006-01-02"), d.Format("Monday"), "", ""'),
      },
    },
    {
      type: 'commit',
      key: 'c-ci',
      at: '2024-04-23T03:10:00Z',
      author: 'tlindqvist',
      message: 'CI: go vet and go test on pushes to main and on PRs',
      files: {
        '.github/workflows/test.yml': ciWorkflow,
      },
    },
    {
      type: 'tag',
      name: 'v0.1.0',
      at: '2024-04-27T14:00:00Z',
      by: 'minhtran',
      message: "v0.1.0: sign-up sheet export\n\nseedling prints the season's watering days as CSV for the sign-up spreadsheet.\n",
    },
    {
      type: 'pr',
      number: 2,
      title: 'Sign-up website (replaces the shared spreadsheet)',
      author: 'minhtran',
      body: `Adds \`seedling serve\`, a one-page website where volunteers enter their name, phone, email, and which weekdays they can usually water.

- Each sign-up is appended to volunteers.csv. Why a CSV and not a database: docs/adr/0001-keep-the-roster-in-a-csv-file.md
- Big fonts and big buttons on purpose, most of the crew will do this on a phone
- The old \`seedling -from ...\` is now \`seedling export -from ...\`

I'll deploy it to the little VPS Tobias set up (the "garden server").`,
      labels: ['feature'],
      requestedReviewers: ['tlindqvist'],
      branch: 'signup-site',
      openedAt: '2024-05-11T19:00:00Z',
      commits: [
        {
          key: 'c-store',
          at: '2024-05-11T19:04:00Z',
          author: 'minhtran',
          message: 'store: append sign-ups to volunteers.csv',
          files: {
            'internal/store/store.go': storeGo,
          },
        },
        {
          key: 'c-serve',
          at: '2024-05-11T21:37:00Z',
          author: 'minhtran',
          message: 'serve: sign-up form',
          files: {
            'cmd/seedling/main.go': mainGo(commandsV2),
            'cmd/seedling/export.go': exportGoV1,
            'cmd/seedling/serve.go': serveGo(false),
            'templates/signup.html': signupHtml(signup.typo),
          },
        },
        {
          key: 'c-adr1',
          at: '2024-05-12T16:10:00Z',
          author: 'minhtran',
          message: 'ADR-0001 csv roster, README',
          files: {
            'docs/adr/0001-keep-the-roster-in-a-csv-file.md': adr1,
            'README.md': readme(R.title, R.needsGo('1.22'), R.signup, R.exportSheet('export ')),
          },
        },
      ],
      reviews: [
        {
          id: 'pr2-rv-tobias',
          author: 'tlindqvist',
          at: '2024-05-14T03:22:00Z',
          state: 'APPROVED',
          body: "Works locally, I signed up as 'Test Tomato' about ten times. One question inline but not blocking.",
          threads: [
            {
              id: 'pr2-th-store',
              path: 'internal/store/store.go',
              line: 32,
              resolved: true,
              comments: [
                {
                  id: 'pr2-thread-tobias',
                  author: 'tlindqvist',
                  at: '2024-05-14T03:22:00Z',
                  body: 'If two people hit submit at the exact same moment, can their rows get mixed together in the file? O_APPEND is atomic for small writes on Linux but I never remember the exact guarantee.',
                },
                {
                  id: 'pr2-thread-minh',
                  author: 'minhtran',
                  at: '2024-05-14T12:10:00Z',
                  body: 'Not with the mutex above, and it is a single process. Fine for 30 gardeners.',
                },
                {
                  id: 'pr2-thread-tobias-2',
                  author: 'tlindqvist',
                  at: '2024-05-14T23:48:00Z',
                  body: 'ah, missed the mutex. lgtm',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr2-rosa',
          author: 'rosa-delgado',
          at: '2024-05-16T14:05:00Z',
          body: 'I tried it on my phone and on the library computer and both worked!! The big letters are perfect. The old Google Form was impossible for some of our folks.',
        },
        {
          id: 'pr2-walt',
          author: 'waltb',
          at: '2024-05-17T15:30:00Z',
          body: 'Signed up. Easier than the paper list in the shed.\n\nWalt',
        },
      ],
      checks: [
        passed('c-serve', '2024-05-11T21:41:00Z'),
        passed('c-adr1', '2024-05-12T16:14:00Z'),
      ],
      outcome: { kind: 'merged', at: '2024-05-18T15:00:00Z', by: 'minhtran' },
    },
    {
      type: 'commit',
      key: 'c-typo',
      at: '2024-05-22T01:13:00Z',
      author: 'tlindqvist',
      message: 'fix typo on thank-you message',
      files: {
        'templates/signup.html': signupHtml(signup.fixed),
      },
    },
    {
      type: 'tag',
      name: 'v0.2.0',
      at: '2024-05-25T13:00:00Z',
      by: 'minhtran',
      message: 'v0.2.0: sign-up website\n\nVolunteers sign up on a web form instead of the shared spreadsheet.\nThe roster lives in volunteers.csv (ADR-0001).\n',
    },
    {
      type: 'discussion',
      number: 3,
      title: "Why can't I sign up for Sundays?",
      category: 'Q&A',
      author: 'waltb',
      at: '2024-06-03T14:22:00Z',
      body: 'Hello. I filled out the new sign-up page and it only lets me pick Monday through Saturday. Sunday is the one day my daughter can drive me over to the garden. Is Sunday left off by mistake?\n\nWalt',
      comments: [
        {
          id: 'disc3-minh',
          author: 'minhtran',
          at: '2024-06-03T16:40:00Z',
          body: 'Not a mistake, Sundays are skipped on purpose. Rosa knows the whole story, I just know the rule.',
          replies: [
            {
              id: 'disc3-rosa',
              author: 'rosa-delgado',
              at: '2024-06-04T01:15:00Z',
              body: "Hi Walt! The garden lot belongs to the church next door and we rent it for a dollar a year. When we signed the lease with Grace Lutheran, the one thing Pastor Ruth asked for was quiet Sunday mornings for the congregation. The sanctuary windows look right out on beds 1-6 and the rain barrel pump is LOUD. We could have done 'Sunday afternoons only' but I didn't want to be the one policing that, so we just said no Sunday shifts at all.",
              reactions: { heart: ['waltb'], '+1': ['minhtran'] },
            },
            {
              id: 'disc3-walt',
              author: 'waltb',
              at: '2024-06-04T13:02:00Z',
              body: "Well that makes sense. I wouldn't want a pump going during the sermon either. Saturday it is.",
            },
          ],
        },
        {
          id: 'disc3-tobias',
          author: 'tlindqvist',
          at: '2024-06-05T02:30:00Z',
          body: 'Could we allow Sunday evening shifts? Services are over by then, right?',
          replies: [
            {
              id: 'disc3-rosa-2',
              author: 'rosa-delgado',
              at: '2024-06-05T14:48:00Z',
              body: "I'd rather not push our luck. They have evening things too sometimes, and the lease comes up for renewal in 2026. Saturday evening watering carries the beds through Sunday except in a real heat wave, and then I just go myself with a watering can, very quietly.",
            },
            {
              id: 'disc3-minh-2',
              author: 'minhtran',
              at: '2024-06-06T03:05:00Z',
              body: 'Leaving it as is then.',
            },
          ],
        },
      ],
      answer: 'disc3-minh',
    },
    {
      type: 'pr',
      number: 4,
      title: "Automatic weekly schedule from everyone's available days",
      author: 'minhtran',
      body: `Right now Rosa builds the weekly schedule by hand from volunteers.csv. This makes \`seedling export\` fill in the volunteer column itself:

- each day goes to someone who said they're free that weekday
- whoever has the fewest shifts so far gets it, ties go to whoever is earlier in the roster
- if nobody is free the cell stays blank

\`seedling export -from 2024-06-24 > shifts.csv\`, then Rosa can tweak it in Sheets before posting.`,
      labels: ['scheduling'],
      requestedReviewers: ['tlindqvist', 'rosa-delgado'],
      branch: 'auto-schedule',
      openedAt: '2024-06-20T23:10:00Z',
      commits: [
        {
          key: 'c-assign',
          at: '2024-06-20T23:12:00Z',
          author: 'minhtran',
          message: 'schedule.Assign: fewest shifts first',
          files: {
            'internal/schedule/assign.go': assignGo(false, '<='),
            'internal/schedule/assign_test.go': assignTestGo(['Ana', 'Ben', 'Ana', 'Ana', 'Ana', 'Ana']),
          },
        },
        {
          key: 'c-assign-ties',
          at: '2024-06-20T23:41:00Z',
          author: 'minhtran',
          message: 'Assign: ties go to the earlier volunteer\n\n<= let a later volunteer with the same count take the day, so Ben got\nMonday instead of Ana. Strict < keeps roster order.\n',
          files: {
            'internal/schedule/assign.go': assignGo(false),
          },
        },
        {
          key: 'c-export-assign',
          at: '2024-06-21T00:30:00Z',
          author: 'minhtran',
          message: 'export fills in volunteers from the roster',
          files: {
            'cmd/seedling/export.go': exportGoV2,
            'cmd/seedling/main.go': mainGo([['export', 'make the weekly schedule as CSV'], ['serve', 'run the sign-up website']]),
            'README.md': readme(R.title, R.needsGo('1.22'), R.signup, R.schedule),
          },
        },
      ],
      reviews: [
        {
          id: 'pr4-rv-rosa',
          author: 'rosa-delgado',
          at: '2024-06-22T19:40:00Z',
          state: 'COMMENTED',
          body: "I don't read code but Minh walked me through this at the garden on Saturday. One question about the rules.",
          threads: [
            {
              id: 'pr4-th-assign',
              path: 'internal/schedule/assign.go',
              line: 31,
              comments: [
                {
                  id: 'pr4-thread-rosa',
                  author: 'rosa-delgado',
                  at: '2024-06-22T19:40:00Z',
                  body: "If I understand this right, it picks whoever has watered the least so far. But what stops it from giving one person Wednesday, Thursday, Friday AND Saturday? Minh showed me the little test at the bottom and that is exactly what happens to Ana!\n\nLast summer we had folks doing four and five days straight during the heat wave and two of our best people burned out by mid-July and never came back. Can we make it so nobody gets two days in a row, even if that leaves a day empty? I'd rather find a sub for an empty day than lose a volunteer.",
                },
                {
                  id: 'pr4-thread-minh',
                  author: 'minhtran',
                  at: '2024-06-22T21:15:00Z',
                  body: "Nothing stops it right now, you're right. Easy to add: skip anyone who had the day before, and leave the day blank if nobody is left. I'll do it as a follow-up right after this goes in so it's there for the first real schedule.",
                },
                {
                  id: 'pr4-thread-rosa-2',
                  author: 'rosa-delgado',
                  at: '2024-06-23T13:02:00Z',
                  body: "Blank is fine, I'll fill those by hand. Thank you!!",
                },
              ],
            },
          ],
        },
        {
          id: 'pr4-rv-tobias',
          author: 'tlindqvist',
          at: '2024-06-24T02:30:00Z',
          state: 'APPROVED',
          body: 'lgtm. Glad the test caught the tie-break on the first push. It reads nicely too, even Rosa could follow it apparently :)',
          threads: [],
        },
      ],
      comments: [
        {
          id: 'pr4-minh',
          author: 'minhtran',
          at: '2024-06-29T16:20:00Z',
          body: "Merging so I can run it for the week of Jul 1. The two-days-in-a-row change from Rosa's comment comes next, separately.",
        },
      ],
      checks: [
        {
          name: 'test',
          commit: 'c-assign',
          at: '2024-06-20T23:15:00Z',
          conclusion: 'failure',
          summary: '--- FAIL: TestAssign (0.00s)\n    assign_test.go:22: Mon: got "Ben", want "Ana"\n    assign_test.go:22: Tue: got "Ana", want "Ben"\nFAIL\tgithub.com/eastside-commons/seedling/internal/schedule',
        },
        passed('c-assign-ties', '2024-06-20T23:45:00Z'),
        passed('c-export-assign', '2024-06-21T00:34:00Z'),
      ],
      outcome: { kind: 'merged', at: '2024-06-29T16:22:00Z', by: 'minhtran' },
    },
    {
      type: 'commit',
      key: 'c-no-repeat',
      at: '2024-07-01T02:48:00Z',
      author: 'minhtran',
      message: 'schedule: skip anyone who watered the day before',
      files: {
        'internal/schedule/assign.go': assignGo(true),
        'internal/schedule/assign_test.go': assignTestGo(['Ana', 'Ben', 'Ana', '', 'Ana', '']),
      },
    },
    {
      type: 'discussion',
      number: 5,
      title: 'Could volunteers swap shifts on their own?',
      category: 'Ideas',
      author: 'rosa-delgado',
      at: '2024-07-06T18:30:00Z',
      body: "Every week I get four to six texts that go 'Rosa I can't do Thursday, can you find someone?' and then I spend my lunch break texting down the list. Is there a way the app could let people trade shifts with each other without me in the middle? Even something simple. I'm not picky about how, I just want my lunch break back.",
      reactions: { '+1': ['waltb', 'minhtran'], heart: ['tlindqvist'] },
      comments: [
        {
          id: 'disc5-walt',
          author: 'waltb',
          at: '2024-07-06T20:00:00Z',
          body: "I have been one of those texts about Thursdays, I admit it. If there were a button I would push it.",
          replies: [
            {
              id: 'disc5-rosa',
              author: 'rosa-delgado',
              at: '2024-07-06T21:10:00Z',
              body: 'Walt you are forgiven, your Thursdays are always for a good reason (grandkids!)',
            },
          ],
        },
        {
          id: 'disc5-minh',
          author: 'minhtran',
          at: '2024-07-07T15:00:00Z',
          body: "Doable. Two shapes I can think of:\n\n(a) accounts, so people log in and manage their own shifts\n(b) a link in each reminder that lets you hand your shift to someone else, no login\n\n(b) is less work and nobody has to remember anything. Reminders don't exist yet though, I'm doing those next.",
          replies: [
            {
              id: 'disc5-tobias',
              author: 'tlindqvist',
              at: '2024-07-08T02:00:00Z',
              body: "I'd like to take this one, I have some time in July. I'll try (a) first since it's more general?",
            },
            {
              id: 'disc5-rosa-2',
              author: 'rosa-delgado',
              at: '2024-07-08T13:00:00Z',
              body: "Whatever is easiest for people who aren't on their phones all day!",
            },
          ],
        },
      ],
    },
    {
      type: 'issue',
      number: 6,
      title: 'Let volunteers hand off a shift without going through Rosa',
      author: 'minhtran',
      at: '2024-07-09T02:35:00Z',
      body: `Tracking Rosa's request from discussion #5 so it doesn't get lost.

Today a volunteer who can't make a shift texts Rosa and she finds a sub. Done means a volunteer can give their shift to someone else on the roster with no Rosa in the middle.

Two shapes came up in the discussion: (a) volunteer accounts, (b) a no-login link in each reminder. Tobias is trying (a) first. (b) needs reminders, which I'm building separately.`,
      labels: ['feature'],
      assignees: ['tlindqvist'],
      comments: [
        {
          id: 'issue6-tobias',
          author: 'tlindqvist',
          at: '2024-07-09T04:20:00Z',
          body: 'Assigned myself. Should have a branch up by the weekend.',
        },
      ],
    },
    {
      type: 'pr',
      number: 7,
      title: 'Volunteer accounts with passwords (WIP)',
      author: 'tlindqvist',
      body: `For #6. This tries option (a) from Rosa's discussion in #5.

This adds an \`internal/auth\` package: you'd set a password when you sign up, then log in at /login to see and drop your shifts. Passwords are bcrypt-hashed and would live in a new column in volunteers.csv.

Still TODO:
- the login page and "my shifts" page
- password reset (no idea how to do this without email or SMS yet)

Opening early to get feedback before I go further. First Go dependency (golang.org/x/crypto), sorry Minh.`,
      labels: ['feature', 'wip'],
      requestedReviewers: ['minhtran'],
      branch: 'volunteer-accounts',
      openedAt: '2024-07-12T04:15:00Z',
      commits: [
        {
          key: 'c-accounts',
          at: '2024-07-12T04:16:00Z',
          author: 'tlindqvist',
          message: 'WIP volunteer accounts (bcrypt)',
          files: {
            'internal/auth/auth.go': authGo,
            'go.mod': gomod('1.22', '\nrequire golang.org/x/crypto v0.25.0\n'),
            'go.sum': cryptoGoSum,
          },
        },
      ],
      reviews: [],
      comments: [
        {
          id: 'pr7-rosa',
          author: 'rosa-delgado',
          at: '2024-07-13T14:00:00Z',
          body: "Tobias thank you for jumping on this! But I have to be honest, a password is going to be a dealbreaker for a lot of our crew. Walt keeps his passwords on an index card in his wallet and he's one of the organized ones. If people get locked out they'll text me anyway, which is the thing we're trying to fix.",
        },
        {
          id: 'pr7-minh',
          author: 'minhtran',
          at: '2024-07-13T19:30:00Z',
          body: "+1 to Rosa. I'm also not thrilled about password hashes in a CSV that Rosa opens in Google Sheets (ADR-0001). What about (b): a link in the reminder text that lets you hand off that one shift. Signed token, expires after the shift date, no login. I'm close on the text reminders.",
        },
        {
          id: 'pr7-walt',
          author: 'waltb',
          at: '2024-07-14T16:10:00Z',
          body: 'For the record it is a very organized index card. But yes, no passwords please.',
        },
        {
          id: 'pr7-tobias',
          author: 'tlindqvist',
          at: '2024-07-17T03:05:00Z',
          body: "Ha, ok, fair on all counts. Closing this. I'll do the link version for #6 once Minh's reminders are in.",
        },
      ],
      checks: [
        passed('c-accounts', '2024-07-12T04:21:00Z', 'go vet ./... and go test ./... passed (internal/auth has no test files)'),
      ],
      outcome: { kind: 'closed', at: '2024-07-17T03:06:00Z', by: 'tlindqvist' },
    },
    {
      type: 'pr',
      number: 8,
      title: 'Text message reminders the evening before a shift',
      author: 'minhtran',
      body: `Adds \`seedling remind\`. Cron on the garden server runs it at 6pm. It looks up tomorrow in shifts.csv and texts that volunteer through Twilio (plain REST call, no SDK).

The Neighborhood Fund micro-grant pays for Twilio this year, details in ADR-0002. The sign-up form now asks for a cell number specifically.

Also adds internal/store/shifts.go so remind can read the schedule. This is step one for #6, the swap link can go in these texts.`,
      labels: ['notifications'],
      requestedReviewers: ['tlindqvist'],
      branch: 'sms-reminders',
      openedAt: '2024-07-22T22:00:00Z',
      commits: [
        {
          key: 'c-sms',
          at: '2024-07-22T22:01:00Z',
          author: 'minhtran',
          message: 'notify: twilio sms sender',
          files: {
            'internal/notify/sms.go': smsGo,
          },
        },
        {
          key: 'c-remind',
          at: '2024-07-23T01:40:00Z',
          author: 'minhtran',
          message: 'remind command + shifts store, crontab for the server',
          files: {
            'internal/store/shifts.go': shiftsGoV1,
            'cmd/seedling/remind.go': remindGoV1,
            'deploy/crontab': crontab(18),
            'cmd/seedling/main.go': mainGo([['export', 'make the weekly schedule as CSV'], ['serve', 'run the sign-up website'], ['remind', "text tomorrow's volunteer"]]),
          },
        },
        {
          key: 'c-adr2',
          at: '2024-07-23T02:15:00Z',
          author: 'minhtran',
          message: 'ADR-0002 sms reminders; ask for cell on the form',
          files: {
            'docs/adr/0002-text-message-reminders.md': adr2('Accepted'),
            'templates/signup.html': signupHtml(signup.sms),
            'README.md': readme(R.title, R.needsGo('1.22'), R.signup, R.schedule, R.remindSms),
          },
        },
      ],
      reviews: [
        {
          id: 'pr8-rv-tobias',
          author: 'tlindqvist',
          at: '2024-07-25T03:00:00Z',
          state: 'APPROVED',
          body: "lgtm, tried it with Twilio's test credentials and my own number.",
          threads: [
            {
              id: 'pr8-th-sms',
              path: 'internal/notify/sms.go',
              line: 31,
              comments: [
                {
                  id: 'pr8-thread-tobias',
                  author: 'tlindqvist',
                  at: '2024-07-25T03:00:00Z',
                  body: "Twilio's error body is actually useful (stuff like 'unverified To number'). Worth reading it into the error?",
                },
                {
                  id: 'pr8-thread-minh',
                  author: 'minhtran',
                  at: '2024-07-25T12:30:00Z',
                  body: 'good call. later though, I want this live before the heat next week.',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr8-rosa',
          author: 'rosa-delgado',
          at: '2024-07-26T15:00:00Z',
          body: "I confirmed with the Neighborhood Fund, the $300 covers texting for the whole season. Please keep the message short, people hate long texts!",
          edits: [
            {
              at: '2024-07-27T16:40:00Z',
              body: "I confirmed with the Neighborhood Fund, the $300 covers texting through the end of the year. Please keep the message short, people hate long texts!\n\nEdit: I first wrote 'for the whole season'. They called back, it's the calendar year, so it runs out Dec 31.",
            },
          ],
          reactions: { '+1': ['minhtran'] },
        },
      ],
      checks: [
        passed('c-sms', '2024-07-22T22:05:00Z'),
        passed('c-adr2', '2024-07-23T02:19:00Z'),
      ],
      outcome: { kind: 'merged', at: '2024-07-29T22:30:00Z', by: 'minhtran' },
    },
    {
      type: 'issue',
      number: 9,
      title: "Can the app text everybody at once when it's really hot?",
      author: 'rosa-delgado',
      at: '2024-07-30T15:20:00Z',
      body: "The forecast says 97 on Thursday and 99 on Friday. When it gets like this I need a few extra people to come water in the evening, and right now I text the whole crew one by one from my phone, which takes most of an hour. Now that the app sends texts, could it send one message to everybody at once? Something like 'Heat wave, extra watering tonight, can you come?'",
      labels: ['notifications'],
      comments: [
        {
          id: 'issue9-minh',
          author: 'minhtran',
          at: '2024-07-30T23:40:00Z',
          body: "It could, Twilio doesn't care if it's 1 text or 30. Two things make me hesitate. Replies would go to the Twilio number, not to you, so I'd have to build something to read them and pass them on. And 30 people times a few heat waves is a real bite out of the $300, which we sized for one reminder per shift. Not a no, just not a quick one.",
        },
        {
          id: 'issue9-rosa',
          author: 'rosa-delgado',
          at: '2024-07-31T14:05:00Z',
          body: "Oh, I didn't think about the replies. The whole point is people text me back 'I can come at 7' and I sort it out. If the answers go to a robot that's worse, not better.",
        },
        {
          id: 'issue9-walt',
          author: 'waltb',
          at: '2024-07-31T18:30:00Z',
          body: "For what it's worth, when it's Rosa asking, I come. When it's the machine asking, I figure somebody else will.",
          reactions: { heart: ['rosa-delgado'], laugh: ['tlindqvist'] },
        },
        {
          id: 'issue9-rosa-2',
          author: 'rosa-delgado',
          at: '2024-08-01T13:00:00Z',
          body: "Walt settles it. I'll keep texting the crew myself when it's hot, people answer me faster anyway. Let's save the grant money for the reminders. Closing this.",
        },
      ],
      outcome: { kind: 'closed', at: '2024-08-01T13:01:00Z', by: 'rosa-delgado', reason: 'not_planned' },
    },
    {
      type: 'pr',
      number: 10,
      title: 'Swap-a-shift link in reminder texts',
      author: 'tlindqvist',
      body: `Closes #6.

Rosa asked for a way for volunteers to trade shifts without going through her (discussion #5). This is Minh's option (b) from that thread:

- every reminder text ends with a link
- the link opens a page with your shift and a dropdown of everyone on the roster
- pick who's taking it, hit the button, shifts.csv is updated

No accounts or passwords (see #7 for why not, and ADR-0003). Links are HMAC-signed with SEEDLING_SWAP_KEY and stop working after the shift date.`,
      labels: ['feature'],
      assignees: ['tlindqvist'],
      requestedReviewers: ['minhtran'],
      reactions: { hooray: ['rosa-delgado', 'waltb'] },
      branch: 'swap-link',
      openedAt: '2024-08-05T03:30:00Z',
      commits: [
        {
          key: 'c-swap',
          at: '2024-08-05T03:31:00Z',
          author: 'tlindqvist',
          message: 'swap: signed per-shift tokens',
          files: {
            'internal/swap/swap.go': swapPkgGo,
            'internal/swap/swap_test.go': swapTestGo,
          },
        },
        {
          key: 'c-swap-web',
          at: '2024-08-06T02:10:00Z',
          author: 'tlindqvist',
          message: 'swap page + link in reminder text',
          files: {
            'cmd/seedling/swap.go': swapWebGo(false),
            'cmd/seedling/serve.go': serveGo(true),
            'cmd/seedling/remind.go': remindGoV2,
            'cmd/seedling/main.go': mainGo(commandsV4),
            'internal/store/shifts.go': shiftsGoV2,
            'templates/swap.html': swapHtml,
          },
        },
        {
          key: 'c-adr3',
          at: '2024-08-06T02:45:00Z',
          author: 'tlindqvist',
          message: 'ADR-0003, README for swap links',
          files: {
            'docs/adr/0003-swap-links-not-accounts.md': adr3,
            'README.md': readme(R.title, R.needsGo('1.22'), R.signup, R.schedule, R.remindSmsSwap),
          },
        },
        {
          key: 'c-swap-taker',
          at: '2024-08-09T02:25:00Z',
          author: 'tlindqvist',
          message: "swap: only hand a shift to someone on the roster\n\nA name that isn't in volunteers.csv would make remind fail the next\nevening. Caught in review.\n",
          files: {
            'cmd/seedling/swap.go': swapWebGo(true),
          },
        },
      ],
      reviews: [
        {
          id: 'pr10-rv-minh-changes',
          author: 'minhtran',
          at: '2024-08-08T03:15:00Z',
          state: 'CHANGES_REQUESTED',
          body: "Token code looks solid and the test covers the cases I'd worry about. One thing has to change before this goes live, inline.",
          threads: [
            {
              id: 'pr10-th-taker',
              path: 'cmd/seedling/swap.go',
              line: 35,
              resolved: true,
              comments: [
                {
                  id: 'pr10-thread-minh-taker',
                  author: 'minhtran',
                  at: '2024-08-08T03:15:00Z',
                  body: "`taker` comes straight from the form and goes into shifts.csv unchecked. If someone edits the page, or Rosa fixes a name in volunteers.csv between the page loading and the submit, we write a name that isn't on the roster. The next evening remind's find() errors, log.Fatal stops the run, and nobody gets a reminder. Can we check taker against the roster first?",
                },
                {
                  id: 'pr10-thread-tobias-taker',
                  author: 'tlindqvist',
                  at: '2024-08-09T02:40:00Z',
                  body: "Oof, good catch. Pushed a fix: POST /swap only accepts names on the roster now, and otherwise says 'Please pick someone from the list.'",
                },
                {
                  id: 'pr10-thread-minh-taker-2',
                  author: 'minhtran',
                  at: '2024-08-10T16:55:00Z',
                  body: 'Looks right, resolving.',
                },
              ],
            },
          ],
        },
        {
          id: 'pr10-rv-minh',
          author: 'minhtran',
          at: '2024-08-10T17:00:00Z',
          state: 'APPROVED',
          body: 'Roster check looks good. Tested on staging with my phone, really nice. One question inline.',
          threads: [
            {
              id: 'pr10-th-open',
              path: 'internal/swap/swap.go',
              line: 23,
              comments: [
                {
                  id: 'pr10-thread-minh',
                  author: 'minhtran',
                  at: '2024-08-10T17:00:00Z',
                  body: 'What happens if someone forwards the link?',
                },
                {
                  id: 'pr10-thread-tobias',
                  author: 'tlindqvist',
                  at: '2024-08-11T01:20:00Z',
                  body: "Whoever has it can hand off that one shift, nothing else. Same as forwarding the text to a friend and asking them to cover. I wrote that down under consequences in the ADR.",
                },
                {
                  id: 'pr10-thread-minh-2',
                  author: 'minhtran',
                  at: '2024-08-11T14:00:00Z',
                  body: 'Works for me.',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr10-rosa',
          author: 'rosa-delgado',
          at: '2024-08-15T23:10:00Z',
          body: 'Walt and I tested it on his phone at the garden tonight. He tapped the link, picked Dolores for his Thursday, and it showed up on the schedule. I may cry. THANK YOU Tobias!!',
          reactions: { heart: ['tlindqvist', 'minhtran'] },
        },
      ],
      checks: [
        passed('c-swap', '2024-08-05T03:35:00Z'),
        passed('c-adr3', '2024-08-06T02:49:00Z'),
        passed('c-swap-taker', '2024-08-09T02:29:00Z'),
      ],
      outcome: { kind: 'merged', at: '2024-08-16T02:00:00Z', by: 'minhtran' },
    },
    {
      type: 'tag',
      name: 'v0.3.0',
      at: '2024-08-17T15:00:00Z',
      by: 'minhtran',
      message: "v0.3.0: automatic schedule, text reminders, swap links\n\nseedling export now builds the weekly schedule from everyone's available days.\nseedling remind texts tomorrow's volunteer (ADR-0002), and each text has a\nlink to hand the shift to someone else (ADR-0003).\n",
      release: {
        title: 'v0.3.0: automatic schedule, text reminders, swap links',
        body: `- \`seedling export\` fills in the weekly schedule from everyone's available days. Nobody gets two days in a row. (#4)
- \`seedling remind\` texts tomorrow's volunteer at 6pm through Twilio. (#8)
- Every reminder has a link to hand the shift to someone else on the roster. (#10)

New environment variables on the garden server: \`TWILIO_ACCOUNT_SID\`, \`TWILIO_AUTH_TOKEN\`, \`TWILIO_FROM\`, \`SEEDLING_SWAP_KEY\`, \`SEEDLING_URL\`.`,
      },
    },
    {
      type: 'issue',
      number: 11,
      title: 'Names on the swap page are all jumbled up',
      author: 'waltb',
      at: '2024-08-19T15:40:00Z',
      body: "When Rosa and I tried the swap link on Thursday the list of names was in no order I could figure out. Dolores was way down near the bottom and I went right past her. It took me two tries. Could the names go in ABC order like a phone book?\n\nWalt",
      labels: ['bug', 'good first issue'],
      assignees: ['tlindqvist'],
      reactions: { '+1': ['rosa-delgado', 'tlindqvist'] },
      comments: [
        {
          id: 'issue11-minh',
          author: 'minhtran',
          at: '2024-08-19T23:10:00Z',
          body: "Thanks Walt. They're in the order people signed up, which only makes sense to the computer. Sorting them is a small change in cmd/seedling/swap.go, so I'm marking it a good first issue in case someone new wants to try some Go.",
        },
      ],
    },
    {
      type: 'pr',
      number: 12,
      title: 'Add a volunteer handbook',
      author: 'rosa-delgado',
      body: "Minh showed me how to add a page from the website. This is the handout I give new people on their first day, typed up so it lives somewhere other than my car. Please fix anything I got wrong about how the app works!",
      labels: ['docs'],
      requestedReviewers: ['minhtran'],
      branch: 'rosa-delgado-patch-1',
      openedAt: '2024-09-07T20:15:00Z',
      commits: [
        {
          key: 'c-handbook',
          at: '2024-09-07T20:15:00Z',
          author: 'rosa-delgado',
          via: 'web',
          message: 'Create volunteer-handbook.md',
          files: {
            'docs/volunteer-handbook.md': handbookV1,
          },
        },
      ],
      reviews: [
        {
          id: 'pr12-rv-minh',
          author: 'minhtran',
          at: '2024-09-08T16:00:00Z',
          state: 'APPROVED',
          body: 'This is great. One small thing inline, take it or leave it.',
          threads: [
            {
              id: 'pr12-th-reminders',
              path: 'docs/volunteer-handbook.md',
              line: 23,
              comments: [
                {
                  id: 'pr12-thread-minh',
                  author: 'minhtran',
                  at: '2024-09-08T16:00:00Z',
                  body: 'The texts go out at 6pm, want to say that here?',
                },
                {
                  id: 'pr12-thread-rosa',
                  author: 'rosa-delgado',
                  at: '2024-09-08T17:30:00Z',
                  body: "I'll leave it loose. Some nights it's a few minutes late and then people text me in a panic.",
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr12-walt',
          author: 'waltb',
          at: '2024-09-08T19:00:00Z',
          body: 'Could we put the lockbox code in here too? I forget it every week.',
        },
        {
          id: 'pr12-rosa',
          author: 'rosa-delgado',
          at: '2024-09-08T20:12:00Z',
          body: "Absolutely not Walt, this is on the internet! I'll write it on your index card.",
          reactions: { laugh: ['minhtran', 'tlindqvist'] },
        },
      ],
      checks: [
        passed('c-handbook', '2024-09-07T20:19:00Z'),
      ],
      outcome: { kind: 'merged', at: '2024-09-09T01:00:00Z', by: 'minhtran' },
    },
    {
      type: 'commit',
      key: 'c-readme-handbook',
      at: '2024-09-10T02:30:00Z',
      author: 'minhtran',
      message: 'README: point volunteers at the handbook',
      files: {
        'README.md': readme(R.title, R.handbookPointer, R.needsGo('1.22'), R.signup, R.schedule, R.remindSmsSwap),
      },
    },
    {
      type: 'commit',
      key: 'c-codeowners',
      at: '2024-09-14T18:00:00Z',
      author: 'minhtran',
      message: 'add CODEOWNERS',
      files: {
        '.github/CODEOWNERS': codeowners,
      },
    },
    {
      type: 'issue',
      number: 13,
      title: 'swap: sort the roster dropdown by name',
      author: 'tlindqvist',
      at: '2024-09-21T03:30:00Z',
      body: `Dolores told me at the garden last weekend that she scrolls past the Hendersons every time she opens a swap link.

The \`<select>\` in templates/swap.html lists \`roster.All()\` as-is, which is volunteers.csv order, i.e. sign-up order. Proposal: sort \`everyone\` by Name with \`slices.SortFunc\` in the GET /swap handler before rendering. Happy to do it.`,
      labels: ['bug', 'duplicate'],
      comments: [
        {
          id: 'issue13-minh',
          author: 'minhtran',
          at: '2024-09-21T15:05:00Z',
          body: 'Walt beat you to it, this is #11. All yours over there.',
        },
        {
          id: 'issue13-tobias',
          author: 'tlindqvist',
          at: '2024-09-22T02:10:00Z',
          body: "Ha, I even gave that one a thumbs up. Closing as a duplicate, I've assigned #11 to myself.",
        },
      ],
      outcome: { kind: 'duplicate', at: '2024-09-22T02:11:00Z', by: 'tlindqvist', of: 11 },
    },
    {
      type: 'discussion',
      number: 14,
      title: 'Season 1 is a wrap! Thank you, watering crew',
      category: 'Announcements',
      author: 'rosa-delgado',
      at: '2024-10-27T16:00:00Z',
      body: `Last shift was yesterday (Oct 26). Some numbers Minh pulled for me:

- 150 watering days, 144 covered
- all 6 missed days were before the text reminders started at the end of July
- 31 volunteers signed up through the website
- the swap link got used 23 times

The tomatoes alone kept the food pantry stocked for six weeks. THANK YOU. See everyone in March!`,
      reactions: { heart: ['waltb', 'minhtran', 'tlindqvist'], hooray: ['waltb'] },
      comments: [
        {
          id: 'disc14-walt',
          author: 'waltb',
          at: '2024-10-27T19:00:00Z',
          body: 'Best season I can remember. I will admit the swap link took me two tries but I got there.',
          replies: [
            {
              id: 'disc14-rosa',
              author: 'rosa-delgado',
              at: '2024-10-27T20:30:00Z',
              body: 'Two tries is better than most of us!',
            },
          ],
        },
        {
          id: 'disc14-minh',
          author: 'minhtran',
          at: '2024-10-28T01:30:00Z',
          body: "Turning off the nightly reminder job on the garden server today. The site goes to sleep until spring, I'll wake it up in March.",
          replies: [
            {
              id: 'disc14-tobias',
              author: 'tlindqvist',
              at: '2024-10-28T03:00:00Z',
              body: "Thanks all. First open source thing I've ever contributed to, and it's for tomatoes. See you in spring.",
            },
          ],
        },
      ],
    },
    {
      type: 'commit',
      key: 'c-go123',
      at: '2024-12-14T21:05:00Z',
      author: 'tlindqvist',
      message: 'go 1.23',
      files: {
        'go.mod': gomod('1.23'),
        'README.md': readme(R.title, R.handbookPointer, R.needsGo('1.23'), R.signup, R.schedule, R.remindSmsSwap),
      },
    },
    {
      type: 'discussion',
      number: 15,
      title: 'Reminders for season 2 (the grant is over)',
      category: 'General',
      author: 'rosa-delgado',
      at: '2025-01-18T17:45:00Z',
      body: `Happy new year everyone! Two things I need to bring up before spring.

1. The Neighborhood Fund micro-grant that paid for the text reminders ended Dec 31. I asked and they are not renewing small grants this round. Minh says texting was costing us around $40 a month in July and August, which we just don't have.

2. At the potluck in November a bunch of our older folks (Walt, Dolores, both Hendersons) told me they'd honestly rather look at a paper schedule on the shed. Half of them never used the swap link, they called me anyway.

So what do we do for reminders this year? I really don't want to go back to me texting everyone by hand.`,
      comments: [
        {
          id: 'disc15-walt',
          author: 'waltb',
          at: '2025-01-18T21:30:00Z',
          body: "I'll say it plainly. I don't read my texts until supper, and by then I've missed the morning. A sheet on the shed door I will see every time I go for the hose.",
          reactions: { '+1': ['rosa-delgado'] },
          replies: [
            {
              id: 'disc15-rosa',
              author: 'rosa-delgado',
              at: '2025-01-19T15:00:00Z',
              body: "Noted Walt, and you're not the only one!",
            },
          ],
        },
        {
          id: 'disc15-minh',
          author: 'minhtran',
          at: '2025-01-20T02:10:00Z',
          body: "Email is free for us, we already have the garden Gmail. I can switch the reminder to email (swap link included) and add a command that prints a big-letter weekly sheet for the shed. Then we cancel Twilio. I'll write it up as ADR-0004 and mark the texting one superseded.",
          replies: [
            {
              id: 'disc15-tobias',
              author: 'tlindqvist',
              at: '2025-01-21T04:00:00Z',
              body: '+1. Gmail SMTP needs an app password, I can set that up on the server. Do we keep collecting phone numbers?',
            },
            {
              id: 'disc15-rosa-2',
              author: 'rosa-delgado',
              at: '2025-01-21T16:20:00Z',
              body: 'Yes keep phones, I still call people when there is a heat wave.',
            },
            {
              id: 'disc15-minh-2',
              author: 'minhtran',
              at: '2025-01-25T18:00:00Z',
              body: 'ok, PR in a couple weeks.',
            },
          ],
        },
      ],
    },
    {
      type: 'pr',
      number: 16,
      title: 'Email reminders and a printed weekly sheet (replaces texts)',
      author: 'minhtran',
      body: `Does what we agreed in #15.

- \`seedling remind\` now emails tomorrow's volunteer (with the swap link) through the garden Gmail. The Twilio code is gone.
- New \`seedling sheet -from <monday>\` prints a big-type weekly schedule for the shed door.
- ADR-0004 records the change, and ADR-0002 is marked superseded.
- Sign-up form: email is now the reminder field, phone is optional.

After this merges I'll cancel the Twilio number.`,
      labels: ['notifications'],
      requestedReviewers: ['tlindqvist'],
      branch: 'email-and-sheet',
      openedAt: '2025-02-08T19:00:00Z',
      commits: [
        {
          key: 'c-email',
          at: '2025-02-08T19:02:00Z',
          author: 'minhtran',
          message: 'remind by email instead of SMS, drop twilio\n\nTwilio account gets cancelled once this ships. See #15.\n',
          files: {
            'internal/notify/email.go': emailGo,
            'internal/notify/sms.go': null,
            'cmd/seedling/remind.go': remindGoV3,
            'cmd/seedling/main.go': mainGo([...commandsV3, ['remind', "email tomorrow's volunteer"]]),
            'templates/signup.html': signupHtml(signup.email),
          },
        },
        {
          key: 'c-sheet',
          at: '2025-02-09T18:30:00Z',
          author: 'minhtran',
          message: 'seedling sheet: printable weekly schedule',
          files: {
            'cmd/seedling/sheet.go': sheetGo,
            'cmd/seedling/main.go': mainGo(commandsV5),
            'templates/weekly-sheet.html': weeklySheetHtml,
          },
        },
        {
          key: 'c-adr4',
          at: '2025-02-09T20:10:00Z',
          author: 'minhtran',
          message: 'ADR-0004 email + paper sheet, supersede ADR-0002',
          files: {
            'docs/adr/0004-email-and-printed-sheet.md': adr4,
            'docs/adr/0002-text-message-reminders.md': adr2('Superseded by ADR-0004'),
            'README.md': readme(R.title, R.handbookPointer, R.needsGo('1.23'), R.signup, R.schedule, R.remindEmail),
          },
        },
      ],
      reviews: [
        {
          id: 'pr16-rv-tobias',
          author: 'tlindqvist',
          at: '2025-02-12T03:40:00Z',
          state: 'APPROVED',
          body: "lgtm. Printed the sample sheet from Chrome, fits on one page. I'll put the Gmail app password on the server once this is in.",
          threads: [
            {
              id: 'pr16-th-noemail',
              path: 'cmd/seedling/remind.go',
              line: 35,
              comments: [
                {
                  id: 'pr16-thread-tobias',
                  author: 'tlindqvist',
                  at: '2025-02-12T03:40:00Z',
                  body: 'For folks with no email this just logs and moves on. Should it tell Rosa somehow?',
                },
                {
                  id: 'pr16-thread-minh',
                  author: 'minhtran',
                  at: '2025-02-12T13:00:00Z',
                  body: "They're the paper-sheet people, that's the point of the sheet. Rosa knows who they are.",
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr16-rosa',
          author: 'rosa-delgado',
          at: '2025-02-13T16:20:00Z',
          body: "Printed the sample at the library. Walt read it from across the shed without his glasses, so I'm calling that a success.",
        },
        {
          id: 'pr16-walt',
          author: 'waltb',
          at: '2025-02-14T15:00:00Z',
          body: 'I had my glasses on. Still, good and big.',
          reactions: { laugh: ['rosa-delgado', 'minhtran'] },
        },
      ],
      checks: [
        passed('c-email', '2025-02-08T19:06:00Z'),
        passed('c-adr4', '2025-02-09T20:14:00Z'),
      ],
      outcome: { kind: 'merged', at: '2025-02-15T17:00:00Z', by: 'minhtran' },
    },
    {
      type: 'pr',
      number: 17,
      title: 'Docs for season 2: index page and how scheduling works',
      author: 'tlindqvist',
      body: `Rosa asked for something she can point new volunteers at that explains how the schedule gets made, so:

- docs/how-scheduling-works.md, written for non-programmers
- docs/index.md, a table of contents split into volunteers vs. developers, including which decision records are still current
- README now opens with a plain-language summary and points at docs/index.md`,
      labels: ['docs'],
      requestedReviewers: ['minhtran', 'rosa-delgado'],
      branch: 'season-2-docs',
      openedAt: '2025-03-01T20:00:00Z',
      commits: [
        {
          key: 'c-docs',
          at: '2025-03-01T20:01:00Z',
          author: 'tlindqvist',
          message: 'docs: index + how scheduling works',
          files: {
            'docs/index.md': docsIndex,
            'docs/how-scheduling-works.md': howScheduling(swapRule.anyone),
          },
        },
        {
          key: 'c-docs-readme',
          at: '2025-03-01T20:40:00Z',
          author: 'tlindqvist',
          message: 'README: season 2 intro, link docs index',
          files: {
            'README.md': readme(R.titleSeason2, R.needsGo('1.23'), R.signup, R.schedule, R.remindEmail),
          },
        },
      ],
      reviews: [
        {
          id: 'pr17-rv-minh',
          author: 'minhtran',
          at: '2025-03-03T02:00:00Z',
          state: 'APPROVED',
          body: 'Read through how-scheduling-works against assign.go, it matches. Thanks for doing this.',
          threads: [
            {
              id: 'pr17-th-ties',
              path: 'docs/how-scheduling-works.md',
              line: 19,
              comments: [
                {
                  id: 'pr17-thread-minh',
                  author: 'minhtran',
                  at: '2025-03-03T02:00:00Z',
                  body: "Accurate. Ties really are sign-up order, since volunteers.csv is only ever appended to.",
                },
                {
                  id: 'pr17-thread-tobias',
                  author: 'tlindqvist',
                  at: '2025-03-03T04:10:00Z',
                  body: "Good, that's how I read it too.",
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr17-walt',
          author: 'waltb',
          at: '2025-03-03T15:30:00Z',
          body: "One thing. The handbook page still says you'll get a text the night before. We don't do texts anymore, and I'd hate for a new person to sit by the phone waiting on one.",
        },
        {
          id: 'pr17-tobias',
          author: 'tlindqvist',
          at: '2025-03-03T17:45:00Z',
          body: 'Good catch Walt. Rosa said she wants to rewrite the reminders part of the handbook herself, so I left that page alone here.',
        },
        {
          id: 'pr17-rosa',
          author: 'rosa-delgado',
          at: '2025-03-04T13:10:00Z',
          body: "Yes!! I'm on it this week. Sorry, it slipped through when we switched.",
        },
      ],
      checks: [
        passed('c-docs-readme', '2025-03-01T20:44:00Z'),
      ],
      outcome: { kind: 'merged', at: '2025-03-04T14:00:00Z', by: 'minhtran' },
    },
    {
      type: 'pr',
      number: 18,
      title: 'Update handbook: reminders come by email now, not text',
      author: 'rosa-delgado',
      body: "Fixes the reminders part that Walt caught on #17. No more texts, it's email plus the paper sheet on the shed door. I did this in the website editor so please check I didn't break anything!",
      labels: ['docs'],
      requestedReviewers: ['minhtran'],
      branch: 'rosa-delgado-patch-2',
      openedAt: '2025-03-09T21:30:00Z',
      commits: [
        {
          key: 'c-handbook-fix',
          at: '2025-03-09T21:30:00Z',
          author: 'rosa-delgado',
          via: 'web',
          message: 'Update volunteer-handbook.md',
          files: {
            'docs/volunteer-handbook.md': handbookV2,
          },
        },
      ],
      reviews: [
        {
          id: 'pr18-rv-minh',
          author: 'minhtran',
          at: '2025-03-10T02:15:00Z',
          state: 'APPROVED',
          body: "Looks right and it renders fine. Nothing broken.",
          threads: [],
        },
      ],
      comments: [
        {
          id: 'pr18-walt',
          author: 'waltb',
          at: '2025-03-10T14:00:00Z',
          body: 'Reads right to me.',
        },
      ],
      checks: [
        passed('c-handbook-fix', '2025-03-09T21:34:00Z'),
      ],
      outcome: { kind: 'merged', at: '2025-03-10T15:00:00Z', by: 'minhtran' },
    },
    {
      type: 'tag',
      name: 'v1.0.0',
      at: '2025-03-22T16:00:00Z',
      by: 'minhtran',
      message: 'v1.0.0: season 2\n\nReminders go out by email and a large-print weekly sheet goes on the shed\ndoor, replacing text messages (ADR-0004). New docs/index.md and\ndocs/how-scheduling-works.md, and the volunteer handbook is up to date.\n',
      release: {
        title: 'v1.0.0: Season 2',
        body: `Ready for the 2025 season. Thank you Rosa, Walt, and Tobias.

## For volunteers

- Reminders come by email the evening before your shift, with the same swap link as before. No more text messages. (#16)
- A large-print schedule for the week goes up on the shed door every Monday. (#16)
- The volunteer handbook is up to date, and a new page explains how the schedule gets made. (#17, #18)

## For whoever runs the server

- \`seedling remind\` sends through the garden Gmail. Set \`SEEDLING_SMTP_USER\` and \`SEEDLING_SMTP_PASSWORD\` (an app password). The Twilio variables are gone and the Twilio number is cancelled.
- New \`seedling sheet -from <monday>\` writes the shed sheet as HTML.
- ADR-0004 supersedes ADR-0002. docs/index.md lists every decision record and its status.
- Go 1.23.

## Known issues

- Names on the swap page are in sign-up order, not alphabetical (#11).`,
      },
    },
    {
      type: 'commit',
      key: 'c-swap-adjacent',
      at: '2025-03-26T01:40:00Z',
      author: 'minhtran',
      message: "swap: don't hand a shift to someone on the day before or after\n\nThe scheduler never gives anyone two days in a row and the handbook says so,\nbut the swap page would hand a shift to someone who already waters the day\nbefore or after. Now it asks for someone else.\n",
      files: {
        'cmd/seedling/swap.go': swapWebGo(true, true),
        'docs/how-scheduling-works.md': howScheduling(swapRule.notNextTo),
      },
    },
    {
      type: 'commit',
      key: 'c-cron-5pm',
      at: '2025-03-29T22:15:00Z',
      author: 'tlindqvist',
      message: 'crontab: remind at 5pm',
      files: {
        'deploy/crontab': crontab(17),
      },
    },
  ],
  answerKey: [
    {
      id: 'growth-arc',
      view: 'timeline',
      facet: 'growth',
      question: 'How did seedling grow from its first commit to the season 2 release?',
      answers: {
        technical:
          "The README at c-init (2024-04-06) states the starting goal: stop typing 150 dates into the sign-up spreadsheet by hand. Four annotated tags mark the phases. v0.1.0 (2024-04-27) prints the season's watering days as CSV for that spreadsheet. v0.2.0 (2024-05-25) moves sign-ups to a web form with the roster in volunteers.csv (ADR-0001). v0.3.0 (2024-08-17) adds `seedling export` building the weekly schedule from availability, `seedling remind` text reminders (ADR-0002), and swap links (ADR-0003). After a winter gap, v1.0.0 (2025-03-22) is season 2: email reminders and a large-print shed sheet replace texts (ADR-0004), plus docs/index.md, docs/how-scheduling-works.md, and an up-to-date volunteer handbook.",
        nonTechnical:
          'It started in April 2024 as a helper that printed the list of watering days for the sign-up spreadsheet. By late May volunteers could sign up on a web page, and by August the app made the weekly schedule itself, sent reminders, and let people hand off a shift. After a quiet winter, the season 2 version in March 2025 switched reminders to email plus a paper schedule on the shed, with a handbook for volunteers.',
      },
      evidence: [
        { kind: 'tag', name: 'v0.1.0', quote: 'v0.1.0: sign-up sheet export' },
        { kind: 'tag', name: 'v0.2.0', quote: 'Volunteers sign up on a web form instead of the shared spreadsheet.' },
        { kind: 'tag', name: 'v0.3.0', quote: "seedling export now builds the weekly schedule from everyone's available days." },
        { kind: 'tag', name: 'v1.0.0', quote: 'replacing text messages (ADR-0004)' },
        { kind: 'file', path: 'README.md', at: 'c-init', quote: 'The first goal is to stop typing 150 dates into the' },
      ],
    },
    {
      id: 'winter-lull',
      view: 'timeline',
      facet: 'growth',
      question: 'What happened between the end of the first season and the start of the second?',
      answers: {
        technical:
          'Discussion #14 (2024-10-27) wraps season 1 the day after the last shift on Oct 26, and Minh says he is turning off the nightly reminder job and the site sleeps until spring. The only commit between then and February 2025 is c-go123 (2024-12-14, go.mod bumped to go 1.23). Planning restarts with discussion #15 on 2025-01-18, which opens the texting question for season 2.',
        nonTechnical:
          'The garden season ended in late October 2024 and the app was switched off for the winter. Apart from one small upkeep change in December, nothing happened until January 2025, when the coordinator started planning reminders for the next season.',
      },
      evidence: [
        { kind: 'discussion', number: 14, quote: 'Last shift was yesterday (Oct 26).' },
        { kind: 'comment', id: 'disc14-minh', quote: 'The site goes to sleep until spring' },
        { kind: 'commit', key: 'c-go123', quote: 'go 1.23' },
        { kind: 'discussion', number: 15, quote: 'Two things I need to bring up before spring.' },
      ],
    },
    {
      id: 'roster-csv',
      view: 'timeline',
      facet: 'adr',
      question: 'Why is the volunteer list kept in a spreadsheet file instead of a database?',
      answers: {
        technical:
          'ADR-0001 (docs/adr/0001-keep-the-roster-in-a-csv-file.md, commit c-adr1 in PR #2, 2024-05-12) keeps the roster in volunteers.csv so Rosa can read and fix it in a spreadsheet without a developer. internal/store/store.go appends rows under a sync.Mutex, which Tobias questioned in the PR #2 review thread. docs/index.md still lists it as Accepted in March 2025.',
        nonTechnical:
          'The team keeps the volunteer list as a plain spreadsheet file so the garden coordinator can open it and fix mistakes herself without needing a programmer. That choice from May 2024 still stands.',
      },
      evidence: [
        { kind: 'file', path: 'docs/adr/0001-keep-the-roster-in-a-csv-file.md', at: 'c-adr1', quote: 'needs to read the roster and fix mistakes herself without asking a' },
        { kind: 'file', path: 'internal/store/store.go', at: 'c-store', quote: 'os.O_APPEND|os.O_CREATE|os.O_WRONLY' },
        { kind: 'comment', id: 'pr2-thread-minh', quote: 'Not with the mutex above' },
        { kind: 'file', path: 'docs/index.md', at: 'c-docs', quote: 'Keep the volunteer roster in a CSV file. Accepted.' },
      ],
    },
    {
      id: 'texts-adopted',
      view: 'timeline',
      facet: 'adr',
      question: 'Why did the app start sending text-message reminders?',
      answers: {
        technical:
          "ADR-0002 (docs/adr/0002-text-message-reminders.md, commit c-adr2 in PR #8, dated 2024-07-23; PR merged 2024-07-29) chose SMS through Twilio's REST API. Six shifts in June and July had been missed, Rosa said the crew reads texts and ignores email, and a $300 Eastside Neighborhood Fund micro-grant could pay for it. internal/notify/sms.go and cmd/seedling/remind.go implement it.",
        nonTechnical:
          'In summer 2024 a few watering days were missed because people forgot. The coordinator said most volunteers read texts, and a small neighborhood grant could cover the cost, so the team started texting each volunteer the evening before their shift.',
      },
      evidence: [
        { kind: 'file', path: 'docs/adr/0002-text-message-reminders.md', at: 'c-adr2', quote: 'Six shifts in June and July were missed because the volunteer forgot.' },
        { kind: 'file', path: 'docs/adr/0002-text-message-reminders.md', at: 'c-adr2', quote: 'Rosa says most of the crew reads texts and ignores email.' },
        { kind: 'comment', id: 'pr8-rosa', quote: 'the $300 covers texting through the end of the year' },
        { kind: 'file', path: 'internal/notify/sms.go', at: 'c-sms', quote: 'https://api.twilio.com/2010-04-01/Accounts/' },
        { kind: 'pr', number: 8, quote: 'The Neighborhood Fund micro-grant pays for Twilio this year, details in ADR-0002.' },
      ],
    },
    {
      id: 'texts-dropped',
      view: 'timeline',
      facet: 'reversal',
      question: 'Why were text reminders dropped, and what replaced them?',
      answers: {
        technical:
          "Discussion #15 (2025-01-18) raised it first. The Neighborhood Fund micro-grant that paid for Twilio ended 2024-12-31, and older volunteers including Walt said they would rather read a paper schedule at the shed. PR #16 (merged 2025-02-15) added ADR-0004: reminders by email from the garden Gmail plus `seedling sheet`, a large-print weekly schedule for the shed door, and removed the Twilio code. Its commit c-adr4 edited ADR-0002's status line to 'Superseded by ADR-0004'.",
        nonTechnical:
          'The small grant that paid for texting ran out at the end of 2024, and several older volunteers said they would rather check a paper schedule at the shed. In February 2025 the team switched to email reminders plus a printed weekly schedule on the shed door, and marked the old texting decision as replaced.',
      },
      evidence: [
        { kind: 'discussion', number: 15, quote: 'The Neighborhood Fund micro-grant that paid for the text reminders ended Dec 31.' },
        { kind: 'comment', id: 'disc15-walt', quote: 'A sheet on the shed door I will see every time I go for the hose.' },
        { kind: 'file', path: 'docs/adr/0004-email-and-printed-sheet.md', at: 'c-adr4', quote: 'The grant ended on December 31, 2024 and will not be renewed.' },
        { kind: 'file', path: 'docs/adr/0002-text-message-reminders.md', at: 'c-adr4', quote: 'Status: Superseded by ADR-0004' },
        { kind: 'pr', number: 16, quote: 'ADR-0004 records the change, and ADR-0002 is marked superseded.' },
      ],
    },
    {
      id: 'handbook-caught-up',
      view: 'timeline',
      facet: 'reversal',
      question: 'After the switch away from texts, when did the volunteer handbook catch up?',
      answers: {
        technical:
          "PR #16 merged on 2025-02-15 without touching docs/volunteer-handbook.md, so the handbook kept saying \"you'll get a text\" (still true at c-adr4 and at c-docs in PR #17). Walt flagged it in a PR #17 comment on 2025-03-03. Rosa fixed it in PR #18 (commit c-handbook-fix, 'Update volunteer-handbook.md'), merged 2025-03-10, 23 days after the switch.",
        nonTechnical:
          'For about three weeks after the switch, the volunteer handbook still told people they would get a text. A volunteer noticed in early March 2025, and the coordinator corrected the handbook on March 10, 2025.',
      },
      evidence: [
        { kind: 'file', path: 'docs/volunteer-handbook.md', at: 'c-docs', quote: "The evening before your shift you'll get a text from the garden's number" },
        { kind: 'comment', id: 'pr17-walt', quote: "The handbook page still says you'll get a text the night before." },
        { kind: 'pr', number: 18, quote: 'reminders come by email now, not text' },
        { kind: 'pr', number: 16, quote: "now emails tomorrow's volunteer (with the swap link)" },
        { kind: 'file', path: 'docs/volunteer-handbook.md', at: 'c-handbook-fix', quote: "We don't send texts anymore." },
      ],
    },
    {
      id: 'no-back-to-back',
      view: 'timeline',
      facet: 'decision',
      question: 'Why does the scheduler never give the same volunteer two days in a row, and where was that decided?',
      answers: {
        technical:
          "It was decided only in Rosa's review thread on PR #4 (internal/schedule/assign.go, 2024-06-22). The summer before, volunteers working four and five days straight burned out and quit. Minh agreed to do it as a follow-up, and c-no-repeat (2024-07-01, pushed straight to main) added the `last` map and the `last[v.Name].Equal(day.AddDate(0, 0, -1))` skip to schedule.Assign, with the expected test output changing to leave Thursday and Saturday blank. Neither the code nor the commit message says why.",
        nonTechnical:
          'The garden coordinator asked for it while looking over the scheduling change in June 2024. The summer before, people who watered several days in a row wore out and quit. The team added the rule a week later, but the reason was only ever written in that conversation.',
      },
      evidence: [
        { kind: 'comment', id: 'pr4-thread-rosa', quote: 'two of our best people burned out by mid-July and never came back' },
        { kind: 'comment', id: 'pr4-thread-minh', quote: "I'll do it as a follow-up" },
        { kind: 'commit', key: 'c-no-repeat', quote: 'schedule: skip anyone who watered the day before' },
        { kind: 'file', path: 'internal/schedule/assign.go', at: 'c-no-repeat', quote: 'if last[v.Name].Equal(day.AddDate(0, 0, -1)) {' },
        { kind: 'file', path: 'internal/schedule/assign_test.go', at: 'c-no-repeat', quote: 'want := []string{"Ana", "Ben", "Ana", "", "Ana", ""}' },
      ],
      onlyOutsideGit: ['burned out by mid-July'],
    },
    {
      id: 'accounts-closed',
      view: 'timeline',
      facet: 'decision',
      question: 'Why did the team never add volunteer logins with passwords?',
      answers: {
        technical:
          "PR #7 (Tobias, opened 2024-07-12) added internal/auth with bcrypt hashes and the project's first dependency, golang.org/x/crypto. Rosa objected that many volunteers can't keep track of passwords and lockouts would come back to her. Minh didn't want password hashes in a CSV opened in Google Sheets (ADR-0001) and proposed a signed swap link instead. Tobias closed the PR unmerged on 2024-07-17. ADR-0003 (PR #10) records the replacement.",
        nonTechnical:
          'A volunteer developer started building logins with passwords in July 2024. The coordinator pointed out that many volunteers would forget their passwords and call her anyway, so the team dropped it and built a one-tap link instead.',
      },
      evidence: [
        { kind: 'pr', number: 7, quote: 'Passwords are bcrypt-hashed' },
        { kind: 'comment', id: 'pr7-rosa', quote: 'a password is going to be a dealbreaker for a lot of our crew' },
        { kind: 'comment', id: 'pr7-minh', quote: 'password hashes in a CSV that Rosa opens in Google Sheets' },
        { kind: 'comment', id: 'pr7-tobias', quote: 'Closing this.' },
        { kind: 'file', path: 'docs/adr/0003-swap-links-not-accounts.md', at: 'c-adr3', quote: 'PR #7 tried volunteer accounts with passwords. We closed it.' },
      ],
    },
    {
      id: 'no-sundays-why',
      view: 'timeline',
      facet: 'unwritten-why',
      question: 'Why are there never any watering shifts on Sundays?',
      answers: {
        technical:
          "The Sunday skip has been in schedule.WateringDays (internal/schedule/days.go) since c-export in PR #1 (2024-04-13). The `weekdays` list in cmd/seedling/serve.go (c-serve, PR #2) also stops at Saturday. Neither explains it. The reason is only in discussion #3: on 2024-06-04 Rosa explained that the lot is leased from Grace Lutheran next door and the pastor asked for quiet Sunday mornings for the congregation, so the team dropped Sunday entirely rather than police afternoon-only shifts.",
        nonTechnical:
          'The garden is on land rented from the church next door, and the church asked for quiet Sunday mornings during services. To keep it simple, the team never schedules anyone on Sundays.',
      },
      evidence: [
        { kind: 'discussion', number: 3, quote: "Why can't I sign up for Sundays?" },
        { kind: 'comment', id: 'disc3-rosa', quote: 'the one thing Pastor Ruth asked for was quiet Sunday mornings for the congregation' },
        { kind: 'comment', id: 'disc3-rosa-2', quote: "I'd rather not push our luck." },
        { kind: 'file', path: 'internal/schedule/days.go', at: 'c-export', quote: 'if d.Weekday() == time.Sunday {' },
        { kind: 'file', path: 'cmd/seedling/serve.go', at: 'c-serve', quote: 'time.Monday, time.Tuesday, time.Wednesday, time.Thursday, time.Friday, time.Saturday,' },
      ],
      onlyOutsideGit: ['quiet Sunday mornings for the congregation', 'lease with Grace Lutheran'],
    },
    {
      id: 'swap-from-coordinator',
      view: 'timeline',
      facet: 'who',
      question: "Which feature came straight from the garden coordinator's request?",
      answers: {
        technical:
          'The swap-a-shift link. Rosa opened discussion #5 (2024-07-06) asking for a way for volunteers to trade shifts without her, and Minh proposed option (b), a link in each reminder. Minh opened issue #6 (2024-07-09) to track the request and it was assigned to Tobias. After the accounts attempt in PR #7 was closed, Tobias built it in PR #10 ("Closes #6.", merged 2024-08-16, which closed issue #6): HMAC-signed per-shift tokens in internal/swap, a swap page, and ADR-0003.',
        nonTechnical:
          'The swap link. The coordinator was spending her lunch breaks finding substitutes, so she asked for a way for volunteers to trade shifts themselves. In August 2024 the team added a link to each reminder that lets a volunteer hand their shift to someone else.',
      },
      evidence: [
        { kind: 'discussion', number: 5, quote: 'I just want my lunch break back.' },
        { kind: 'comment', id: 'disc5-minh', quote: '(b) a link in each reminder that lets you hand your shift to someone else, no login' },
        { kind: 'issue', number: 6, quote: "Tracking Rosa's request from discussion #5" },
        { kind: 'pr', number: 10, quote: 'Closes #6.' },
        { kind: 'file', path: 'docs/adr/0003-swap-links-not-accounts.md', at: 'c-adr3', quote: 'She asked for a way around that in discussion #5.' },
        { kind: 'comment', id: 'pr10-rosa', quote: 'picked Dolores for his Thursday' },
      ],
    },
    {
      id: 'who-scheduling',
      view: 'timeline',
      facet: 'who',
      question: 'Who should someone ask about how the schedule is made?',
      answers: {
        technical:
          'Minh Tran (@minhtran). He authored PR #4 (schedule.Assign) and the c-no-repeat follow-up, and c-codeowners (2024-09-14) makes him the code owner of /internal/schedule/. docs/how-scheduling-works.md (c-docs, PR #17) says he wrote the scheduling code and names Rosa Delgado as the person who runs the schedule day to day.',
        nonTechnical:
          'Ask Minh Tran, the volunteer developer who wrote the scheduling part of the app. Rosa Delgado, the garden coordinator, runs the schedule week to week.',
      },
      evidence: [
        { kind: 'file', path: '.github/CODEOWNERS', at: 'c-codeowners', quote: '/internal/schedule/  @minhtran' },
        { kind: 'file', path: 'docs/how-scheduling-works.md', at: 'c-docs', quote: 'Minh Tran wrote the scheduling code.' },
        { kind: 'pr', number: 4, quote: "Automatic weekly schedule from everyone's available days" },
        { kind: 'commit', key: 'c-no-repeat', quote: 'schedule: skip anyone who watered the day before' },
        { kind: 'comment', id: 'pr4-rv-rosa', quote: 'Minh walked me through this' },
      ],
    },
    {
      id: 'declined-heat-wave-text',
      view: 'timeline',
      facet: 'decision',
      question: 'What did the garden coordinator ask the app to do that the team decided not to build, and why?',
      answers: {
        technical:
          "A group text to the whole crew during heat waves. Rosa asked for it in issue #9 (2024-07-30), the day after text reminders shipped. Minh pointed out that replies would land on the Twilio number instead of reaching Rosa, and that blasts to 30 people would eat into the $300 grant sized for one reminder per shift. Walt added that he comes when Rosa asks personally but assumes someone else will answer the machine. Rosa closed the issue as not planned on 2024-08-01 and kept texting the crew herself, which the first handbook (c-handbook, PR #12) says under Heat waves.",
        nonTechnical:
          'During a July 2024 heat wave the coordinator asked whether the app could text the whole crew at once to find extra waterers. Replies would have gone to the app instead of to her, and the grant money was meant for shift reminders. A volunteer added that people come when she asks them herself, so she decided to keep sending those messages from her own phone.',
      },
      evidence: [
        { kind: 'issue', number: 9, quote: 'could it send one message to everybody at once?' },
        { kind: 'comment', id: 'issue9-minh', quote: 'Replies would go to the Twilio number, not to you' },
        { kind: 'comment', id: 'issue9-walt', quote: "when it's Rosa asking, I come" },
        { kind: 'comment', id: 'issue9-rosa-2', quote: "I'll keep texting the crew myself when it's hot" },
        { kind: 'file', path: 'docs/volunteer-handbook.md', at: 'c-handbook', quote: 'text the crew directly when that happens.' },
      ],
    },
    {
      id: 'ci-caught-tie',
      view: 'timeline',
      facet: 'how',
      question: 'What did the automated checks catch before the automatic schedule went in?',
      answers: {
        technical:
          "A tie-break bug. On PR #4 the first push, c-assign (2024-06-20), failed the `test` check: TestAssign got Ben on Monday and Ana on Tuesday because schedule.Assign compared counts with `<=`, so a tie went to the later volunteer. Thirty minutes later c-assign-ties switched to `<` so ties go to roster order, and the check passed on c-assign-ties and c-export-assign before Tobias approved. The check is the go vet and go test workflow Tobias added in c-ci (2024-04-23).",
        nonTechnical:
          "The app's automatic checks caught that when two volunteers had the same number of shifts, the day went to whoever signed up later instead of earlier. Minh fixed it the same evening, more than a week before the new schedule was used for a real week.",
      },
      evidence: [
        { kind: 'file', path: 'internal/schedule/assign.go', at: 'c-assign', quote: 'count[v.Name] <= count[pick]' },
        { kind: 'commit', key: 'c-assign-ties', quote: 'Strict < keeps roster order.' },
        { kind: 'file', path: 'internal/schedule/assign.go', at: 'c-assign-ties', quote: 'if pick == "" || count[v.Name] < count[pick] {' },
        { kind: 'comment', id: 'pr4-rv-tobias', quote: 'Glad the test caught the tie-break on the first push.' },
        { kind: 'file', path: '.github/workflows/test.yml', at: 'c-ci', quote: '- run: go test ./...' },
      ],
    },
    {
      id: 'review-roster-check',
      view: 'timeline',
      facet: 'decision',
      question: 'What did review change in the swap-link feature before it shipped?',
      answers: {
        technical:
          "Minh's CHANGES_REQUESTED review on PR #10 (2024-08-08, against c-adr3) flagged that POST /swap wrote `taker` from the form into shifts.csv unchecked. A name missing from volunteers.csv would make remind's find() fail, and log.Fatal would stop that night's reminders. Tobias pushed c-swap-taker (2024-08-09), which adds onRoster to cmd/seedling/swap.go and answers 'Please pick someone from the list.' otherwise. Minh resolved the thread and approved on 2024-08-10.",
        nonTechnical:
          "A reviewer noticed that the shift hand-off page would accept any name, even someone not on the volunteer list, and that this would have stopped the next evening's reminders from going out. The developer made the page accept only people on the list, and the feature was approved two days later.",
      },
      evidence: [
        { kind: 'comment', id: 'pr10-rv-minh-changes', quote: 'One thing has to change before this goes live' },
        { kind: 'comment', id: 'pr10-thread-minh-taker', quote: 'log.Fatal stops the run, and nobody gets a reminder' },
        { kind: 'commit', key: 'c-swap-taker', quote: 'only hand a shift to someone on the roster' },
        { kind: 'file', path: 'cmd/seedling/swap.go', at: 'c-swap-taker', quote: 'if !onRoster(roster, taker) {' },
        { kind: 'comment', id: 'pr10-rv-minh', quote: 'Roster check looks good.' },
      ],
    },
    {
      id: 'what-is-it',
      view: 'docs',
      facet: 'overview',
      question: 'What is seedling and who is it for?',
      answers: {
        technical:
          'A standard-library-only Go app (module github.com/eastside-commons/seedling, go 1.23) for the Eastside Commons community garden. As of v1.0.0 the README covers the sign-up site (`seedling serve`), the weekly schedule (`seedling export`), email reminders (`seedling remind`), and the shed sheet (`seedling sheet`). Volunteers and the coordinator read docs/volunteer-handbook.md and docs/how-scheduling-works.md. The two volunteer developers read the README and docs/adr/.',
        nonTechnical:
          'Seedling is the app the Eastside Commons community garden uses to organize who waters the garden each day. Volunteers sign up on a web page, the app makes the weekly schedule, emails a reminder the night before, and prints a schedule for the shed door.',
      },
      evidence: [
        { kind: 'file', path: 'README.md', at: 'c-docs-readme', quote: 'Seedling runs the watering schedule for the Eastside Commons community' },
        { kind: 'file', path: 'README.md', at: 'c-docs-readme', quote: 'before their shift, and prints a big-type schedule for the shed door.' },
        { kind: 'file', path: 'go.mod', at: 'c-go123', quote: 'module github.com/eastside-commons/seedling' },
        { kind: 'file', path: 'docs/index.md', at: 'c-docs', quote: '## For volunteers' },
      ],
    },
    {
      id: 'docs-map',
      view: 'docs',
      facet: 'overview',
      question: 'Where should a volunteer start reading, and where should a developer start?',
      answers: {
        technical:
          'docs/index.md (c-docs, PR #17, 2025-03-01) splits the docs. "For volunteers" links volunteer-handbook.md and how-scheduling-works.md. "For developers" links README.md and the four ADRs with their current status. The README (c-docs-readme) points volunteers at the handbook and everyone else at docs/index.md. Before that, from c-readme-handbook (2024-09-10), the README already sent volunteers to the handbook.',
        nonTechnical:
          'Volunteers should start with the volunteer handbook, then the page that explains how the schedule is made. The people who build the app start with the main project page and the written decision records. A contents page links all of them.',
      },
      evidence: [
        { kind: 'file', path: 'docs/index.md', at: 'c-docs', quote: '## For developers' },
        { kind: 'file', path: 'docs/index.md', at: 'c-docs', quote: '[How scheduling works](how-scheduling-works.md): how the app decides who waters which day.' },
        { kind: 'file', path: 'README.md', at: 'c-docs-readme', quote: 'Volunteers: start with the [volunteer handbook](docs/volunteer-handbook.md).' },
        { kind: 'pr', number: 17, quote: 'a table of contents split into volunteers vs. developers' },
        { kind: 'commit', key: 'c-readme-handbook', quote: 'README: point volunteers at the handbook' },
      ],
    },
    {
      id: 'notified-now',
      view: 'docs',
      facet: 'how',
      question: 'How do volunteers find out about their shifts now?',
      answers: {
        technical:
          "Since PR #16 (merged 2025-02-15), cmd/seedling/remind.go emails tomorrow's volunteer through notify.Email (net/smtp to smtp.gmail.com:587) with a swap link, and skips volunteers with no email. `seedling sheet` renders templates/weekly-sheet.html, which Rosa prints and posts on the shed door each Monday (ADR-0004). The handbook only says so from PR #18 (2025-03-10).",
        nonTechnical:
          "The evening before a shift, the app emails the volunteer with the date and a link to hand the shift to someone else. Every Monday the coordinator also posts a big-print schedule for the week on the shed door, for people who don't use email.",
      },
      evidence: [
        { kind: 'file', path: 'cmd/seedling/remind.go', at: 'c-email', quote: 'Addr:     "smtp.gmail.com:587",' },
        { kind: 'file', path: 'templates/weekly-sheet.html', at: 'c-sheet', quote: '<th>Initials when done</th>' },
        { kind: 'file', path: 'docs/adr/0004-email-and-printed-sheet.md', at: 'c-adr4', quote: 'prints it and posts it on the shed door every Monday.' },
        { kind: 'file', path: 'docs/volunteer-handbook.md', at: 'c-handbook-fix', quote: "you'll get an email from the garden" },
      ],
    },
    {
      id: 'how-scheduler-picks',
      view: 'docs',
      facet: 'how',
      question: 'How does the app decide who waters which day?',
      answers: {
        technical:
          'schedule.WateringDays (internal/schedule/days.go) lists Monday to Saturday. schedule.Assign (internal/schedule/assign.go) walks the days in order. Among volunteers whose Days include that weekday, it picks the lowest count, and ties go to roster order, which is sign-up order in the append-only volunteers.csv. Since c-no-repeat it also skips whoever had the previous day, and leaves the day blank if nobody is left. docs/how-scheduling-works.md (c-docs) states the same five rules.',
        nonTechnical:
          'The app looks at which days each volunteer said they are free. It gives each day to the free person who has had the fewest shifts that week, and a tie goes to whoever signed up first. Nobody gets two days in a row, there are no Sunday shifts, and a day nobody can take stays open for the coordinator to fill.',
      },
      evidence: [
        { kind: 'file', path: 'internal/schedule/assign.go', at: 'c-no-repeat', quote: 'if pick == "" || count[v.Name] < count[pick] {' },
        { kind: 'file', path: 'internal/schedule/days.go', at: 'c-no-repeat', quote: 'if d.Weekday() == time.Sunday {' },
        { kind: 'file', path: 'docs/how-scheduling-works.md', at: 'c-docs', quote: 'If two people are tied, whoever signed up first gets it.' },
        { kind: 'comment', id: 'pr17-thread-minh', quote: 'Ties really are sign-up order' },
        { kind: 'file', path: 'docs/how-scheduling-works.md', at: 'c-docs', quote: '5. If nobody is left for a day, the day stays blank and Rosa finds someone.' },
      ],
    },
    {
      id: 'decisions-current',
      view: 'docs',
      facet: 'adr',
      question: 'Which written decisions are still in force, and which were replaced?',
      answers: {
        technical:
          'docs/adr/ has four records. ADR-0001 (CSV roster), ADR-0003 (swap links, not accounts), and ADR-0004 (email plus printed sheet) are Accepted. ADR-0002 (SMS via Twilio) has read "Status: Superseded by ADR-0004" since c-adr4 in PR #16 (2025-02-09), and ADR-0004 carries "Supersedes: ADR-0002". docs/index.md lists the same statuses.',
        nonTechnical:
          'The team has four written decision records. Three still apply: keeping the volunteer list as a spreadsheet file, swapping shifts by link instead of passwords, and email plus a paper schedule for reminders. The one about text messages was replaced in February 2025.',
      },
      evidence: [
        { kind: 'file', path: 'docs/index.md', at: 'c-handbook-fix', quote: 'Send shift reminders by text message. Superseded by ADR-0004.' },
        { kind: 'file', path: 'docs/adr/0002-text-message-reminders.md', at: 'c-adr4', quote: 'Status: Superseded by ADR-0004' },
        { kind: 'file', path: 'docs/adr/0003-swap-links-not-accounts.md', at: 'c-handbook-fix', quote: 'Status: Accepted' },
        { kind: 'file', path: 'docs/adr/0004-email-and-printed-sheet.md', at: 'c-handbook-fix', quote: 'Supersedes: ADR-0002' },
        { kind: 'file', path: 'docs/adr/0001-keep-the-roster-in-a-csv-file.md', at: 'c-handbook-fix', quote: 'Status: Accepted' },
      ],
    },
    {
      id: 'docs-sunday-gap',
      view: 'docs',
      facet: 'unwritten-why',
      question: 'The docs say there are no Sunday shifts. Do they say why?',
      answers: {
        technical:
          "No. Rule 1 in docs/how-scheduling-works.md and the 'Signing up' section of docs/volunteer-handbook.md state that there are no Sunday shifts and give no reason, and no ADR covers it. The reason lives only in discussion #3, where Rosa cites the lease with Grace Lutheran and the pastor's request for quiet Sunday mornings for the congregation.",
        nonTechnical:
          'No. The volunteer pages only say there are no Sunday shifts. The reason, a promise to the church next door to keep Sunday mornings quiet, was only explained in a conversation on the project discussion board.',
      },
      evidence: [
        { kind: 'file', path: 'docs/how-scheduling-works.md', at: 'c-docs', quote: '1. Watering days are Monday through Saturday. There are no shifts on Sundays.' },
        { kind: 'file', path: 'docs/volunteer-handbook.md', at: 'c-handbook-fix', quote: 'There are no shifts on Sundays.' },
        { kind: 'comment', id: 'disc3-rosa', quote: 'When we signed the lease with Grace Lutheran' },
      ],
      onlyOutsideGit: ['lease with Grace Lutheran'],
    },
    {
      id: 'docs-back-to-back-gap',
      view: 'docs',
      facet: 'unwritten-why',
      question: 'The docs say nobody is scheduled two days in a row. Where is the reason written?',
      answers: {
        technical:
          "Nowhere in the repository. Rule 4 in docs/how-scheduling-works.md and the 'Your schedule' section of the handbook state the rule, and c-no-repeat implements it without a comment. The reason is only in the PR #4 review thread on internal/schedule/assign.go, where Rosa says that people working several days straight burned out by mid-July the summer before.",
        nonTechnical:
          'Only in a comment the coordinator left while the team was looking over the scheduling change. The summer before, people who watered several days in a row wore out and stopped coming, and she said she would rather fill an empty day than lose a volunteer.',
      },
      evidence: [
        { kind: 'file', path: 'docs/how-scheduling-works.md', at: 'c-docs', quote: '4. Nobody is scheduled two days in a row.' },
        { kind: 'file', path: 'docs/volunteer-handbook.md', at: 'c-handbook', quote: 'never get two days in a row.' },
        { kind: 'comment', id: 'pr4-thread-rosa', quote: "I'd rather find a sub for an empty day than lose a volunteer." },
        { kind: 'comment', id: 'pr4-thread-rosa', quote: 'burned out by mid-July' },
        { kind: 'file', path: 'internal/schedule/assign.go', at: 'c-no-repeat', quote: 'last[pick] = day' },
      ],
      onlyOutsideGit: ['burned out by mid-July'],
    },
    {
      id: 'open-swap-names',
      view: 'docs',
      facet: 'overview',
      question: 'Is anything volunteers reported still unfixed as of season 2?',
      answers: {
        technical:
          'Yes. Issue #11 (Walt, 2024-08-19) reports that names on the swap page are not in alphabetical order. The dropdown in templates/swap.html lists roster.All(), which is volunteers.csv sign-up order. Tobias filed the same problem in developer terms as issue #13 (2024-09-21), closed it as a duplicate of #11, and assigned #11 to himself, but nothing in the repository sorts the roster. The v1.0.0 release notes list it under Known issues, and issue #11 is still open.',
        nonTechnical:
          'Yes. Since August 2024, volunteers have said the list of names on the shift hand-off page is in the order people signed up rather than alphabetical, so names are hard to find. A developer took it on in September but never finished it, and the season 2 release notes still list it as a known problem.',
      },
      evidence: [
        { kind: 'issue', number: 11, quote: 'Could the names go in ABC order like a phone book?' },
        { kind: 'comment', id: 'issue11-minh', quote: "They're in the order people signed up" },
        { kind: 'issue', number: 13, quote: 'sort the roster dropdown by name' },
        { kind: 'comment', id: 'issue13-tobias', quote: "Closing as a duplicate, I've assigned #11 to myself." },
        { kind: 'file', path: 'templates/swap.html', at: 'c-handbook-fix', quote: '{{range .Roster}}<option>{{.Name}}</option>' },
        { kind: 'tag', name: 'v1.0.0', quote: 'Names on the swap page are in sign-up order, not alphabetical (#11).' },
      ],
    },
    {
      id: 'currency-stdlib-only',
      view: 'docs',
      facet: 'overview',
      job: 'currency',
      question: 'Is it still true that seedling uses only the Go standard library, as the README says?',
      answers: {
        technical:
          'Yes. "Standard library only." has been in the README since c-export (PR #1, 2024-04-13) and is still there at main. go.mod at main has no require lines and there is no go.sum. The only dependency ever proposed, golang.org/x/crypto for bcrypt in PR #7, was closed unmerged on 2024-07-17. Later features stayed in the standard library: crypto/hmac for swap links and net/smtp for email reminders.',
        nonTechnical:
          'Yes. Since April 2024 the developer notes have said the app needs nothing beyond the tools that come with its programming language, and that still holds. The one attempt to add an outside package, for volunteer passwords in July 2024, was dropped.',
      },
      evidence: [
        { kind: 'file', path: 'README.md', at: 'c-export', quote: 'Needs Go 1.22 or newer. Standard library only.' },
        { kind: 'file', path: 'README.md', at: 'c-cron-5pm', quote: 'Needs Go 1.23 or newer. Standard library only.' },
        { kind: 'file', path: 'go.mod', at: 'c-cron-5pm', quote: 'module github.com/eastside-commons/seedling\n\ngo 1.23\n' },
        { kind: 'pr', number: 7, quote: 'First Go dependency (golang.org/x/crypto), sorry Minh.' },
        { kind: 'comment', id: 'pr7-tobias', quote: 'Closing this.' },
        { kind: 'file', path: 'internal/notify/email.go', at: 'c-cron-5pm', quote: '"net/smtp"' },
      ],
    },
    {
      id: 'currency-reminder-6pm',
      view: 'docs',
      facet: 'how',
      job: 'currency',
      question: 'Is it still true that reminders go out at 6pm, as the README says?',
      answers: {
        technical:
          'No. The README line "Cron runs this at 6pm on the garden server." was written in c-adr2 (PR #8, 2024-07-23), when deploy/crontab ran remind at `0 18 * * *`, and it survived the email rewrite in PR #16. On 2025-03-29 Tobias\'s c-cron-5pm changed deploy/crontab to `0 17 * * *` and left the README alone, so at main reminders go out at 5pm. The handbook never gave a time (Rosa kept it loose in the PR #12 review), so it is still right.',
        nonTechnical:
          'No. The developer notes still say 6pm, but since late March 2025 the reminder goes out at 5pm, and nobody updated the notes. The volunteer handbook only says "the evening before", so it is still right.',
      },
      evidence: [
        { kind: 'file', path: 'README.md', at: 'c-adr2', quote: 'Cron runs this at 6pm on the garden server.' },
        { kind: 'file', path: 'deploy/crontab', at: 'c-remind', quote: '0 18 * * * cd /srv/seedling' },
        { kind: 'commit', key: 'c-cron-5pm', quote: 'crontab: remind at 5pm' },
        { kind: 'file', path: 'deploy/crontab', at: 'c-cron-5pm', quote: '0 17 * * * cd /srv/seedling' },
        { kind: 'file', path: 'README.md', at: 'c-cron-5pm', quote: 'Cron runs this at 6pm on the garden server.' },
        { kind: 'file', path: 'docs/volunteer-handbook.md', at: 'c-cron-5pm', quote: "The evening before your shift you'll get an email from the garden" },
        { kind: 'comment', id: 'pr12-thread-rosa', quote: "I'll leave it loose." },
      ],
    },
    {
      id: 'currency-two-days-in-a-row',
      view: 'docs',
      facet: 'how',
      job: 'currency',
      question: 'Is it still true that nobody ever gets two watering days in a row, as the volunteer handbook says?',
      answers: {
        technical:
          'Yes at main, but only since c-swap-adjacent (Minh, 2025-03-26). The scheduler has skipped whoever watered the day before since c-no-repeat (2024-07-01), before Rosa wrote "you\'ll never get two days in a row" in the handbook (c-handbook, 2024-09-07). The swap page only checked that the taker was on the roster, so handing a shift to someone who had the day before or after gave them two in a row. c-swap-adjacent added nextTo to cmd/seedling/swap.go, which refuses that taker, and updated docs/how-scheduling-works.md to match.',
        nonTechnical:
          'Yes, but only since late March 2025. The automatic schedule has never given anyone two days in a row. Until that fix, though, a volunteer handing off a shift could pass it to someone already watering the day before or after. The hand-off page now says no to that.',
      },
      evidence: [
        { kind: 'file', path: 'docs/volunteer-handbook.md', at: 'c-handbook', quote: 'never get two days in a row.' },
        { kind: 'file', path: 'internal/schedule/assign.go', at: 'c-cron-5pm', quote: 'if last[v.Name].Equal(day.AddDate(0, 0, -1)) {' },
        { kind: 'file', path: 'cmd/seedling/swap.go', at: 'c-swap-taker', quote: 'if !onRoster(roster, taker) {' },
        { kind: 'commit', key: 'c-swap-adjacent', quote: 'but the swap page would hand a shift to someone who already waters the day' },
        { kind: 'file', path: 'cmd/seedling/swap.go', at: 'c-cron-5pm', quote: 'if nextTo(shifts, date, taker) {' },
        { kind: 'file', path: 'docs/how-scheduling-works.md', at: 'c-cron-5pm', quote: "isn't already watering the day before or after." },
      ],
    },
    {
      id: 'go-123-why-gap',
      view: 'timeline',
      facet: 'unwritten-why',
      expect: 'gap',
      question: 'Why did seedling move from Go 1.22 to Go 1.23 in December 2024?',
      answers: {
        technical:
          'The record does not say. c-go123 (Tobias, 2024-12-14, pushed straight to main during the winter break) changes go.mod from go 1.22 to go 1.23 and the README to "Needs Go 1.23 or newer", with the message "go 1.23" and nothing else. The v1.0.0 release notes only list "Go 1.23." No review, issue, or discussion mentions it, and no code at main needs a 1.23 feature. Ask Tobias Lindqvist, who made the change.',
        nonTechnical:
          'The notes do not say. In December 2024, while the garden was closed for winter, Tobias moved the app to a newer version of its programming language and left no reason. Ask Tobias.',
      },
      evidence: [
        { kind: 'commit', key: 'c-go123', quote: 'go 1.23' },
        { kind: 'file', path: 'go.mod', at: 'c-init', quote: 'go 1.22' },
        { kind: 'file', path: 'go.mod', at: 'c-go123', quote: 'go 1.23' },
        { kind: 'file', path: 'README.md', at: 'c-go123', quote: 'Needs Go 1.23 or newer.' },
        { kind: 'tag', name: 'v1.0.0', quote: '- Go 1.23.' },
      ],
      truth: 'Tobias moved the garden server to a cheaper VPS plan over the winter, and the new machine came with Go 1.23. He raised go.mod so laptops and the test workflow build with the same Go as the server.',
      notRecorded: ['cheaper VPS plan'],
    },
    {
      id: 'reminder-5pm-why-gap',
      view: 'timeline',
      facet: 'unwritten-why',
      expect: 'gap',
      question: 'Why do reminders go out at 5pm now instead of 6pm?',
      answers: {
        technical:
          'The record does not say. c-cron-5pm (Tobias, 2025-03-29, pushed straight to main) changes deploy/crontab from `0 18 * * *` to `0 17 * * *` with the message "crontab: remind at 5pm". No review, issue, discussion, or doc explains it, and the README still says 6pm. Ask Tobias Lindqvist, who made the change.',
        nonTechnical:
          'The notes do not say. In late March 2025 Tobias moved the evening reminder an hour earlier, from 6pm to 5pm, without writing down why. Ask Tobias.',
      },
      evidence: [
        { kind: 'commit', key: 'c-cron-5pm', quote: 'crontab: remind at 5pm' },
        { kind: 'file', path: 'deploy/crontab', at: 'c-remind', quote: '0 18 * * *' },
        { kind: 'file', path: 'deploy/crontab', at: 'c-cron-5pm', quote: '0 17 * * *' },
      ],
      truth: 'Rosa asked Tobias at the season kickoff to move reminders an hour earlier. She leaves the community center at 5:30 and wanted anyone who needs help finding a sub to reach her before she goes home.',
      notRecorded: ['season kickoff', 'community center'],
    },
    {
      id: 'example-assign-week',
      view: 'docs',
      facet: 'how',
      question: 'Give me a concrete example: if Ana is free Monday to Saturday and Ben only on Mondays and Tuesdays, who waters each day that week?',
      answers: {
        technical:
          'TestAssign in internal/schedule/assign_test.go at main runs that roster for the week of Monday, July 1, 2024 and expects Ana, Ben, Ana, blank, Ana, blank for Monday to Saturday. Monday is a tie at zero shifts, so roster order gives it to Ana. Tuesday skips Ana, who watered Monday, so Ben gets it. Thursday and Saturday stay blank because Ana watered the day before and Ben is not free. The expected list has not changed since c-no-repeat (2024-07-01).',
        nonTechnical:
          "The app's own test uses exactly that case. Ana gets Monday, Wednesday and Friday, and Ben gets Tuesday. Thursday and Saturday stay open for the coordinator to fill, because Ana watered the day before and Ben is only free early in the week.",
      },
      evidence: [
        { kind: 'file', path: 'internal/schedule/assign_test.go', at: 'c-cron-5pm', quote: '{Name: "Ben", Days: []time.Weekday{time.Monday, time.Tuesday}},' },
        { kind: 'file', path: 'internal/schedule/assign_test.go', at: 'c-cron-5pm', quote: 'want := []string{"Ana", "Ben", "Ana", "", "Ana", ""}' },
        { kind: 'file', path: 'internal/schedule/assign.go', at: 'c-cron-5pm', quote: 'Ties go to whoever comes first in the roster.' },
        { kind: 'file', path: 'docs/how-scheduling-works.md', at: 'c-cron-5pm', quote: '4. Nobody is scheduled two days in a row.' },
      ],
    },
    {
      id: 'example-swap-link-expiry',
      view: 'docs',
      facet: 'how',
      question: 'Give me a concrete example of when a swap link stops working.',
      answers: {
        technical:
          "TestTokenRoundTrip in internal/swap/swap_test.go at main signs a link for Walt's shift on Thursday, August 8, 2024. Opened that Thursday, swap.Signer.Open returns Walt and the date. Opened on Friday it fails, because Open rejects a shift date before the current day (days start at midnight UTC). A token checked with a different SEEDLING_SWAP_KEY also fails.",
        nonTechnical:
          "The app's own test uses Walt's Thursday shift. His link works on that Thursday and stops working on Friday, the day after. A link made with a different secret key is refused, so nobody can make their own.",
      },
      evidence: [
        { kind: 'file', path: 'internal/swap/swap_test.go', at: 'c-cron-5pm', quote: 'thu := time.Date(2024, time.August, 8, 0, 0, 0, 0, time.UTC)' },
        { kind: 'file', path: 'internal/swap/swap_test.go', at: 'c-cron-5pm', quote: 't.Error("token still works the day after the shift")' },
        { kind: 'file', path: 'internal/swap/swap_test.go', at: 'c-cron-5pm', quote: 't.Error("token signed with a different key was accepted")' },
        { kind: 'file', path: 'internal/swap/swap.go', at: 'c-cron-5pm', quote: 'date.Before(now.Truncate(24*time.Hour))' },
      ],
    },
  ],
  noise: [
    {
      id: 'noise-edited-grant',
      kind: 'corrected-claim',
      description: "Rosa's PR #8 comment first said the grant covers texting for the whole season. Her edit the next day says through the end of the year, which matches the Dec 31 end date in discussion #15 and ADR-0004.",
      evidence: [
        { kind: 'comment', id: 'pr8-rosa', quote: 'the $300 covers texting for the whole season', revision: 0 },
        { kind: 'comment', id: 'pr8-rosa', quote: 'the $300 covers texting through the end of the year' },
      ],
    },
    {
      id: 'noise-duplicate-swap-names',
      kind: 'duplicate',
      description: "Issue #13 reports the unsorted swap dropdown in developer terms. It duplicates Walt's plain-language issue #11, which stays open.",
      evidence: [
        { kind: 'issue', number: 13, quote: 'swap: sort the roster dropdown by name' },
        { kind: 'issue', number: 11, quote: 'Names on the swap page are all jumbled up' },
      ],
    },
  ],
  views,
};

export default spec;
