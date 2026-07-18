package anime

type schedulePlacementRef struct {
	animeID string
	order   int
	index   int
}

var allowedScheduleDestinations = map[string]struct{}{
	"Lunes": {}, "Martes": {}, "Miércoles": {}, "Jueves": {}, "Viernes": {}, "Sábado": {}, "Domingo": {},
	"Sin ver": {}, "Ver hoy": {}, "Visto": {},
}

// scheduleDestinationOrder returns the canonical schedule destination order.
func scheduleDestinationOrder() []string {
	return []string{"Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo", "Sin ver", "Ver hoy", "Visto"}
}
