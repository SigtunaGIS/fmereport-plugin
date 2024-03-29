const Fmereport = function Fmereport({
  reportNames = ['Report name 1'],
  reportUrls = ['FME Flow URL with token parameter']
} = {}) {

  const
  icon = '#fa-info-circle',
  dom = Origo.ui.dom,
  source = new Origo.ol.source.Vector(),
  vector = new Origo.ol.layer.Vector({
  group: 'none',
  name: 'reportLayer',
  title: 'reportLayer',
  source,
  zIndex: 8,
  styleName: 'origoStylefunction'
});
  
  let 
  content,
  itemCoordinate,
  jsonAsHTML,
  reportButton,
  reportToolBox,
  reportToolBoxContent,
  reportSelect,
  reportToolTitle,
  reportBox,
  reportBoxContent,
  closeButton,
  pointButton,
  target,
  viewer,
  map,
  requestButton,
  isActive = false,
  polygonActive = false,
  geom,
  coordinatesArray = [],
  polygonButton,
  actLikeRadioButton,
  jsonData,
  draw = new Origo.ol.interaction.Draw({
  source: source,
  type: 'Polygon'
});  

//Initiate fetch from FME Flow ( or other source)
const fetchContent = async () => {
  //No geometry or no selected report results in alert error
  if (coordinatesArray.length === 0) {
    window.alert("Ingen geometri ritad");
    return;
  }
  if (document.getElementById(reportSelect.getId()).value === ''){
    window.alert("Ingen rapport vald");
    return;
  }
  document.getElementById(reportToolBox.getId()).classList.add('o-hidden');
  document.body.style.cursor = 'wait';
  try {
    //Call FME Flow
    //TODO: Implementera autentisering mot FME Flow för att kunna nyttja FME api. Möjliggör då dynamiska vallistor baserade på användarens behörigheter och dynamiska parameterval baserade på publicerade parametrar för workspace.
    const response = await fetch(document.getElementById(reportSelect.getId()).value + '&PARAMETER='+coordinatesArray);
    //No response from call throws error
    if (!response.ok) {
      throw new Error('Network response was not ok.');
    }
    //Empty string, occurs when no data is in requested area

     jsonData = await response.json();

     //Generate ID for object that lack ID
     if (jsonData && jsonData.category && jsonData.category.length > 0) {
      
      for(const category of jsonData.category){
        for(const item of category.item){
          if(!item.id){
            item.id = generateId();
          }
        }
      }
      //Generete and render report
      content = createJsonTable(jsonData);
      jsonAsHTML = Origo.ui.Element({
        tagName: 'div',
        innerHTML: content
      });
      let divs = document.getElementById(reportBox.getId()).getElementsByTagName('div');
      if (divs.length > 1) {
        document.getElementById(reportBox.getId()).removeChild(divs[1]); // This removes the first div inside the container
      }
      document.getElementById(reportBox.getId()).appendChild(dom.html(jsonAsHTML.render()));
    
      //Add listener to buttons in report
      for(const category of jsonData.category){
        for(const item of category.item){
          if(item.id && item.geometry ){
            document.getElementById(item.id).addEventListener('click', onClickItem);
        }
      }
      }
      document.getElementById(reportBox.getId()).classList.remove('o-hidden');
     } 
     else {
      throw new Error('No data found within the area.');
    }
    } 
    catch (error) {
      console.error('Error fetching content:', error);
      Origo.ui.Modal({
        title: error.message.includes('No data') ? "Resultat" : "Fel vid anrop",
        content: error.message.includes('No data') ? "Ingen information hittades inom området" : "Något gick fel vid anrop, prova igen eller kontakta systemadministratör",
        target: viewer.getId()
      });
      disableReportButton();
    }
    finally {
      document.body.style.cursor = 'default';
    }};


//Activate layer, zoom and getFeaturInfo for object
const onClickItem = (e) => {
  for(const category of jsonData.category){
    for(const item of category.item){
      if((item.id == e.srcElement.id || item.id == e.srcElement.parentNode.parentNode.id) && category.layerName){
        origo.api().getLayer(category.layerName).setVisible(true);
        itemCoordinate = JSON.parse(item.geometry);
        map.getView().setCenter(itemCoordinate);
     
        //Kan använda origo api för simplare implementering men detta säkerställer att det funkar även för wms-källor. Krav på json blir då unikt id för objekt istället för geometri.
        //Exempel: 
        //origo.api().getFeatureinfo().showFeatureInfo({ feature: origo.api().getLayer(lagernamn).getSource().getFeatureById(lagerid), layerName: lagernamn });

        //TODO:Look for other solution than setTimeout as it is not ideal
        setTimeout(() => {
        pixel = map.getPixelFromCoordinate(itemCoordinate);

        parameters = {
        clusterFeatureinfoLevel: 2,
        coordinate: itemCoordinate, 
        hitTolerance: 5,
        map: map,
        pixel: pixel};

        remoteParameters = {
          coordinate: itemCoordinate, 
          map: map,
          pixel: pixel}

        //Get vector features
        const clientResult = Origo.getFeatureInfo.getFeaturesAtPixel(parameters, viewer);
        //Get WMS features
        Origo.getFeatureInfo.getFeaturesFromRemote(remoteParameters, viewer).then((data) => {
          const serverResult = data || [];
          const result = serverResult.concat(clientResult).filter((feature) => feature.selectionGroup == category.layerName);
          //Show infowindow and zoom to object
          if( (result.length > 0)) {
            origo.api().getFeatureinfo().render(result, 'overlay', itemCoordinate,false);
            map.getView().fit(result[0].feature.getGeometry().getExtent());
          }
        });
      }, "150");
    }
  }
  }
}

const createJsonTable = (jsonData) => {
  // Create a container element to hold the generated HTML
  const container = document.createElement('div');
  const rubrik = Origo.ui.Element({
    tagName: 'div',
    cls: 'report-header',
    innerHTML: jsonData.title
  });
  container.innerHTML = rubrik.render();

  //Generate categories
  for (const cat of jsonData.category) {
    container.appendChild(createReportCategory(cat));
  }
  // Return the container's HTML content
  return container.innerHTML;
};

const createReportCategory = (categories) => {

  // Create a container element to hold the generated HTML
  const catContainer = document.createElement('div');
  catContainer.className = 'report-container';

  const title = document.createElement('div');
  title.className = 'category-header';
  title.textContent = categories.name;
  catContainer.appendChild(title);
  //Create items
  for (const item of categories.item) {
    //Create textinformation
    catContainer.appendChild(createReportItem(item));
    //Create buttons
    const linkEl = createReportLink(item);
    const mapEl = createReportMap(item);

    catContainer.appendChild(linkEl);
    catContainer.appendChild(mapEl);
  }

  return catContainer;
}

const createReportLink = (item) => {
  const linkEl = document.createElement('a');
  linkEl.className = 'report-button';
  if (item.link) {
    const linkButtonEl = createReportButton(item.icon);
    linkEl.href = item.link;
    linkEl.target = '_blank';
    linkEl.rel = 'noopener noreferrer';
    linkEl.innerHTML = linkButtonEl.render();
  }
  return linkEl;
}

const createReportMap = (item) => {
  const mapEl = document.createElement('div');
  mapEl.className = 'report-button';
  if (item.geometry) {
    const mapButtonEl = createReportButton(); 
    item.id = mapButtonEl.getId(); 
    mapEl.innerHTML = mapButtonEl.render();
  }
  return mapEl;
}

const createReportButton = (icon) => {
  return Origo.ui.Button({
    cls: 'o-fmereport padding-small icon-smaller round light box-shadow tooltip',
    tagName: 'div',
    icon: icon || '#fa-map-marker'
  });
}

const createReportItem = (item) => {
  const itemContainer = document.createElement('div');
  itemContainer.className = 'report-item-wrapper';
  
  const title = document.createElement('div');
  title.className = 'report-item-header';
  title.textContent = item.title;
  itemContainer.appendChild(title);
  
  const descEl = document.createElement('div');
  descEl.className = 'report-item';
  //Text from FME, replace newrow with br
  descEl.innerHTML = item.description.replace(/\n/g, '<br>');
  itemContainer.appendChild(descEl);

  return itemContainer;
}

const generateId = () => {
  return Math.random().toString(36).substr(2, 9);
};

const addDoubleClickZoomInteraction = () => {
  const allDoubleClickZoomInteractions = [];
  map.getInteractions().forEach((interaction) => {
    if (interaction instanceof Origo.ol.interaction.DoubleClickZoom) {
      allDoubleClickZoomInteractions.push(interaction);
    }
  });
  if (allDoubleClickZoomInteractions.length < 1) {
    map.addInteraction(new Origo.ol.interaction.DoubleClickZoom());
  }
};

const enableDoubleClickZoom = () => {
  setTimeout(() => {
    addDoubleClickZoomInteraction();
  }, 100);
};

const disableDoubleClickZoom = (evt) => {
  const featureType = evt.feature.getGeometry().getType();
  const interactionsToBeRemoved = [];

  if (featureType === 'Point') {
    return;
  }
  map.getInteractions().forEach((interaction) => {
    if (interaction instanceof Origo.ol.interaction.DoubleClickZoom) {
      interactionsToBeRemoved.push(interaction);
    }
  });
  if (interactionsToBeRemoved.length > 0) {
    map.removeInteraction(interactionsToBeRemoved[0]);
  }
}
const onDrawStart = (evt) => { 
  if (evt.feature.getGeometry().getType() !== 'Point') {
    disableDoubleClickZoom(evt);
  }
}

const toggleDraw = (active) => { 
  const details = {
    tool: 'ReportGeometry',
    active: active
  };
  setTimeout(() => {
  viewer.dispatch('toggleClickInteraction', details);
  },100);
};

const handleOverlapping = () => {
  if (document.getElementsByClassName('o-search').length > 0) {
    const search = document.getElementsByClassName('o-search')[0];
    const filter = document.getElementById(reportToolBoxContent.getId());

    if (isOverlapping(search, filter)) {
      document.getElementById(reportToolBox.getId()).style.top = '4rem';
      breakingWidth = window.innerWidth;
    } else if (window.innerWidth > breakingWidth) {
      document.getElementById(reportToolBox.getId()).style.top = '1rem';
    }
  }
}

//Enables/disables and clears geom when activating draw polygon
const mapInteraction = () => {
  if(polygonActive){
    clearGeometry()
    map.removeInteraction(draw);
    draw.setActive(false);
    document.getElementById(polygonButton.getId()).classList.remove('active'); 
    document.getElementById(polygonButton.getId()).classList.remove('hover');
    toggleDraw(false);
    polygonActive = false;
  }
  else{
  clearGeometry()
  document.getElementById(polygonButton.getId()).classList.add('active');
  toggleDraw(true);
  
  map.addInteraction(draw);
  draw.setActive(true);
  polygonActive = true;
  }
  draw.on('drawstart', onDrawStart, this);
  draw.on('drawend', (evt) => {
    geom = evt.feature.getGeometry().clone();
    let coordinates = geom.flatCoordinates
    coordinatesArray = []
    //Creates coordinateArray for FME Flow
    for (let i = 0; i < coordinates.length-2; i++) {
      coordinatesArray.push(coordinates[i] +  ":" + coordinates[i+1])
      i++
 
    }
    document.getElementById(polygonButton.getId()).classList.remove('active');
    enableDoubleClickZoom();
    toggleDraw(false);
    map.removeInteraction(draw);
    draw.setActive(false);
    polygonActive = false;
  });
}


const enableReportButton = () => {
  document.getElementById(reportButton.getId()).classList.add('active');
  document.getElementById(reportButton.getId()).classList.remove('tooltip');
  document.getElementById(reportToolBox.getId()).classList.remove('o-hidden');

  if (actLikeRadioButton) {
    setActive(true);
  }
}


const disableReportButton = () => {
  document.getElementById(reportBox.getId()).classList.add('o-hidden');
  document.getElementById(reportButton.getId()).classList.remove('active');
  document.getElementById(reportButton.getId()).classList.add('tooltip');
  document.getElementById(reportToolBox.getId()).classList.add('o-hidden');
  if (map && draw) {
    map.removeInteraction(draw);
    draw.setActive(false);
  }
  clearGeometry();
  if (actLikeRadioButton) {
    setActive(false);
  }
}


const clearGeometry = () => {
  if (source) {
    source.clear();
  }
  geom = '';
  coordinatesArray = [];
}


const toggleReportButton = () => {
  clearGeometry();
  if (actLikeRadioButton) {
    const detail = {
      name: 'report',
      active: !isActive
    };
    viewer.dispatch('toggleClickInteraction', detail);
  } else if (document.getElementById(reportButton.getId()).classList.contains('tooltip')) {
    enableReportButton();
    handleOverlapping();
  } else {
    disableReportButton();
  }
}

//Creates report list from option from initiation
const renderReportSelect= () => {
  const select = document.getElementById(reportSelect.getId());
 
  // Loop over each report name in the reportsArray
  reportNames.forEach((reportName, index) => {
    const option = document.createElement('option');
    option.value = reportUrls[index]; 
    option.text = reportName;
    select.appendChild(option);
  });
}

return Origo.ui.Component({
  name: 'fmereport',
  onInit() {

    reportToolBox = Origo.ui.Element({
      tagName: 'div',
      cls: 'flex column control box bg-white overflow-hidden o-hidden filter-box',
      style: {
        left: '4rem',
        top: '1rem',
        padding: '0.5rem',
        width: '15rem',
        'z-index': '-1'
      }
    });
   
    reportSelect = Origo.ui.Element({
      tagName: 'select',
      cls: 'width-100',
      style: {
        padding: '0.2rem',
        'font-size': '0.8rem'
      },
      innerHTML: '<option value="">Välj rapport...</option>'
    });

    reportToolTitle = Origo.ui.Element({
      tagName: 'p',
      cls: 'text-smaller',
      innerHTML: 'Rapportverktyg:'
    });
     
    closeButton = Origo.ui.Button({
      cls: 'small round margin-top-smaller margin-bottom-auto margin-right-small icon-smaller grey-lightest',
      icon: '#ic_close_24px',
      style:{
        float: 'right'
      }
    });

    //TODO: implementera knapp med funktionalitet för att hämta en gometri från kartan med getFeatureInfo för att använda i rapporten
    polygonButton = Origo.ui.Button({
      cls: 'grow light text-smaller box-shadow padding-left-large',
      text: 'Polygon'
    }); 
    pointButton = Origo.ui.Button({
      cls: 'grow light text-smaller box-shadow padding-left-large',
      text: 'Rita en punkt'
    });

    requestButton = Origo.ui.Button({
      cls: 'light rounded-large border text-smaller padding-right-large o-tooltip',
      text: 'Skicka rapport',
      style: {
        padding: '0.4rem',
        width: '10rem',
        'background-color': '#ebebeb'
      }
    });

    reportToolBoxContent = Origo.ui.Element({
      tagName: 'div',
      components: [ reportToolTitle,polygonButton,pointButton,reportSelect,requestButton]
    });

    reportBoxContent = Origo.ui.Element({
      tagName: 'div',
      components: [ closeButton]
    });

    reportBox = Origo.ui.Element({
      tagName: 'div',
      cls: 'flex column control box bg-white overflow-hidden o-hidden filter-box draggable',
      style: {
        left: '4rem',
        top: '1rem',
        padding: '0.5rem',
        'max-width': '30rem',
        'overflow-x': 'auto',
        'overflow-y': 'auto',
        'z-index': '-1'
      }
    });

    reportButton = Origo.ui.Button({
      cls: 'o-fmereport padding-small icon-smaller round light box-shadow tooltip',
      click() {
        toggleReportButton();
      },
      icon: icon,
      tooltipText: 'Ta fram en rapport',
      tooltipPlacement: 'east'
    });
   
  },

  onAdd(evt) {
    viewer = evt.target;
    if (!target) target = `${viewer.getMain().getMapTools().getId()}`;
    map = viewer.getMap();
    map.addLayer(vector);
    this.addComponents([reportButton]);
    this.render();
    if (actLikeRadioButton) {
      viewer.on('toggleClickInteraction', (detail) => {
        if (detail.name === 'report' && detail.active) {
          enableReportButton();
        } else {
          disableReportButton();
        }
      });
    }
    renderReportSelect();
  },

  render() {
    document.getElementById(target).appendChild(dom.html(reportButton.render()));
    document.getElementById(viewer.getMain().getId()).appendChild(dom.html(reportToolBox.render()));
    document.getElementById(viewer.getMain().getId()).appendChild(dom.html(reportBox.render()));
    document.getElementById(reportToolBox.getId()).appendChild(dom.html(reportToolBoxContent.render()));
    document.getElementById(reportBox.getId()).appendChild(dom.html(reportBoxContent.render()));
  
    document.getElementById(requestButton.getId()).addEventListener('click', () => fetchContent());
    document.getElementById(closeButton.getId()).addEventListener('click', () => disableReportButton());
    document.getElementById(polygonButton.getId()).addEventListener('click', () => mapInteraction());
    
    this.dispatch('render');
  }
});
};

export default Fmereport;