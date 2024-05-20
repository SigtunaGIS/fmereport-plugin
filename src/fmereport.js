import {jsPDF} from 'jspdf';
const Fmereport = function Fmereport({
  reportNames = ['Report name 1'],
  reportUrls = ['FME Flow URL with token parameter'],
  reportIcon = '#fa-info-circle'
} = {}) {

  const
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
  layerName,
  itemCoordinate,
  jsonAsHTML,
  reportButton,
  reportToolBox,
  reportToolBoxContent,
  reportSelect,
  reportToolTitle,
  reportToolBoxHeaderComponent,
  reportBox,
  closeButtonToolBox,
  closeButtonReportBox,
  geometryButtonsText,
  polygonButton,
  pointButton,
  geometryButtonsComponent,
  requestButtonText,
  requestButton,
  requestButtonComponent,
  pdfExportButtonEl,
  target,
  viewer,
  map,
  activeTool = null,
  geom,
  coordinatesArray = [],
  jsonData,
  draw,
  reportHeader,
  layerGid;  

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
        document.getElementById(reportBox.getId()).removeChild(divs[0]); // This removes the first div inside the container
      }
      document.getElementById(reportBox.getId()).appendChild(dom.html(jsonAsHTML.render()));
      origo.api().getUtils().makeElementDraggable(document.getElementById(reportBox.getId()));
      document.getElementById(closeButtonReportBox.getId()).addEventListener('click', () => disableReportButton());

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
        title: error.message.includes('Unexpected') || error.message.includes('No data') ? "Resultat" : "Fel vid anrop",
        content: error.message.includes('Unexpected') || error.message.includes('No data') ? "Ingen information hittades inom området" : "Något gick fel vid anrop, prova igen eller kontakta systemadministratör",
        target: viewer.getId()
      });
      disableReportButton();
    }
    finally {
      document.body.style.cursor = 'default';
      document.getElementById(pdfExportButtonEl.getId()).addEventListener('click', () => downloadPDF(document.getElementById(reportBox.getId())));
    }};


//Activate layer, zoom and getFeaturInfo for object
const onClickItem = (e) => {
  //clear possible featureinfowindow
  origo.api().getFeatureinfo().clear();

  const category = jsonData.category.find(c => c.item.some(i => i.id === e.srcElement.id || i.id === e.srcElement.parentNode.parentNode.id));
  const item = category.item.find(i => i.id === e.srcElement.id || i.id === e.srcElement.parentNode.parentNode.id);

  origo.api().getLayer(category.layerName).setVisible(true);
  itemCoordinate = JSON.parse(item.geometry);
  layerName = category.layerName;
  layerGid = item.gid;

  map.once('rendercomplete', () => onRenderComplete(itemCoordinate, layerName, layerGid));
  //Extra settings to find feature when vector layer with id is not present
  if(origo.api().getLayer(layerName).getProperties().layerType != 'vector' || !layerGid){
    origo.api().getMap().getView().setZoom(10);
    map.getView().setCenter(itemCoordinate);
  }
}

const onRenderComplete = (itemCoordinate, layerName, layerGid) =>{
  //Only run function if there is a coordinate 
  if (!itemCoordinate) return;

  //Vector layer with ID field can make use of origo api function to show and zoom to object
  if(origo.api().getLayer(layerName).getProperties().layerType == 'vector' && layerGid){
    origo.api().getFeatureinfo().showFeatureInfo({ feature: origo.api().getLayer(layerName).getSource().getFeatureById(`${layerName}.${layerGid}`), layerName: layerName });
  }
  //Vector layer without ID field or WMS layer need more handling
  else{
    let pixel = map.getPixelFromCoordinate(itemCoordinate);
    let parameters = { clusterFeatureinfoLevel: 2, coordinate: itemCoordinate, hitTolerance: 5, map: map, pixel: pixel};
    let remoteParameters = { coordinate: itemCoordinate, map: map, pixel: pixel}

    //Get vector features
    const clientResult =  Origo.getFeatureInfo.getFeaturesAtPixel(parameters, viewer);
    //Get WMS features
    Origo.getFeatureInfo.getFeaturesFromRemote(remoteParameters, viewer).then((data) => {
      const serverResult = data || [];
      const result = serverResult.concat(clientResult).filter((feature) => feature.feature.id_ === `${layerName}.${layerGid}` || feature.selectionGroup === layerName);
      //Show infowindow and zoom to object
      if( (result.length > 0)) {
        //Get infowindow type from config or default to overlay. Infowindow can also be set from index.json
        origo.api().getFeatureinfo().render(result, viewer.getViewerOptions().featureinfoOptions.infowindow || 'overlay', itemCoordinate);
        map.getView().fit(result[0].feature.getGeometry().getExtent());
      }
    });
  }
}

const createJsonTable = (jsonData) => {
  // Create a container element to hold the generated HTML
  const container = document.createElement('div');
  const rubrik = Origo.ui.Element({
    innerHTML: jsonData.title
  });
  const rubrikComponent = Origo.ui.Element({
    cls: 'report-header flex row sticky bg-white margin-left draggable grab',
    style: {
      top: '0',
      'justify-content': 'space-between'
    },
    components: [rubrik, closeButtonReportBox]
  });
  reportHeader = rubrikComponent.getId()
  container.innerHTML = rubrikComponent.render();

  //Generate categories
  for (const cat of jsonData.category) {
    container.appendChild(createReportCategory(cat));
  }
  //Generate an export button
  const exportEl = document.createElement('div');
  exportEl.className = 'export-container';

  exportEl.innerHTML = pdfExportButtonEl.render();
  container.appendChild(exportEl);
  
  
  // Return the container's HTML content
  return container.innerHTML;
};

const createReportCategory = (categories) => {

  // Create a container element to hold the generated HTML
  const catContainer = document.createElement('div');
  catContainer.className = 'report-container margin-left margin-right';

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
  linkEl.className = 'report-button-wrapper';
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
  mapEl.className = 'report-button-wrapper';
  if (item.geometry) {
    const mapButtonEl = createReportButton(); 
    item.id = mapButtonEl.getId(); 
    mapEl.innerHTML = mapButtonEl.render();
  }
  return mapEl;
}

const createReportButton = (icon) => {
  return Origo.ui.Button({
    cls: 'o-fmereport padding-small icon-smaller round light box-shadow tooltip report-button\" data-html2canvas-ignore=\"true\"',
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

//Set active when drawing to not invoke getFeatureInfo click interaction etc.
const toggleDraw = (active) => { 
  const details = {
    tool: 'ReportGeometry',
    active: active
  };
  setTimeout(() => {
  viewer.dispatch('toggleClickInteraction', details);
  },100);
};

//Enables/disables and clears geom when activating draw polygon
const mapInteraction = (drawTool) => {
  const toolButtonMapping = {
    'Polygon': polygonButton.getId(),
    'Point': pointButton.getId(),
    // Add more tools here as needed, for example:
    // 'Pick': pickGeometryButton.getId(),
  };
  let activeButtonId = toolButtonMapping[drawTool];
 // If draw is active remove the existing interaction
  if (draw) {
    map.removeInteraction(draw);
    draw = null;
  }
  // Deactivate the previously active tool's button
  if (activeTool) {
    document.getElementById(toolButtonMapping[activeTool]).classList.remove('active', 'hover');
    toggleDraw(false);
  }
  // If the selected tool is already active, deactivate it
  if(activeTool === drawTool){
    clearGeometry();
    activeTool = null;
  }
  else{
    activeTool = drawTool;
    clearGeometry()
    document.getElementById(activeButtonId).classList.add('active');
    toggleDraw(true);
    // Create a new draw interaction with the selected draw tool
    draw = new Origo.ol.interaction.Draw({
      source: source,
      type: drawTool 
    });
  
    map.addInteraction(draw);
    draw.setActive(true);
    
  draw.on('drawstart', onDrawStart, this);
  draw.on('drawend', (evt) => {
    geom = evt.feature.getGeometry().clone();
    let coordinates = geom.flatCoordinates;
    coordinatesArray = [];
    //Creates coordinateArray for FME Flow
    if(drawTool == 'Polygon'){
      for (let i = 0; i < coordinates.length-2; i++) {
        coordinatesArray.push(coordinates[i] +  ":" + coordinates[i+1])
        i++
      }
    }
    else {
      coordinatesArray.push(coordinates[0] +  ":" + coordinates[0+1]);
    }
    document.getElementById(activeButtonId).classList.remove('active');
    document.getElementById(requestButton.getId()).classList.remove('disabled');
    document.getElementById(requestButtonText.getId()).innerHTML = 'Geometri vald';
    enableDoubleClickZoom();
    toggleDraw(false);
    map.removeInteraction(draw);
    draw.setActive(false);
    activeTool = null;
  });
  }
}

const enableReportButton = () => {
  document.getElementById(reportButton.getId()).classList.add('active');
  document.getElementById(reportToolBox.getId()).classList.remove('o-hidden');
}


const disableReportButton = () => {
  document.getElementById(reportBox.getId()).classList.add('o-hidden');
  document.getElementById(reportButton.getId()).classList.remove('active');
  document.getElementById(reportToolBox.getId()).classList.add('o-hidden');
  if (map && draw) {
    map.removeInteraction(draw);
    draw.setActive(false);
  }
  clearGeometry();
}

//Removes drawn geometry and empties coordinate(s) to be sent to FME
const clearGeometry = () => {
  if (source) {
    source.clear();
  }
  geom = '';
  coordinatesArray = [];
  //Set requestButton to disabled when no geometry is drawn  
  document.getElementById(requestButton.getId()).classList.add('disabled');
  document.getElementById(requestButtonText.getId()).innerHTML = 'Ingen geometri vald';
}


const toggleReportButton = () => {
  clearGeometry();
  document.getElementById(reportToolBox.getId()).style.cssText = 'top: 1rem; left: 4rem; width: 16rem;';
  document.getElementById(reportBox.getId()).style.cssText = 'top: 1rem; left: 4rem; overflow-x: auto; overflow-y: auto; z-index: -1; user-select: none;'; 
  if (!document.getElementById(reportButton.getId()).classList.contains('active')) {
    enableReportButton();
  } else {
    disableReportButton();
  }
}

const downloadPDF = async function downloadPDF(el) {
  const pdf = new Origo.jsPDF('p', 'pt', 'a4');

  pdf.html(el,{
    callback: function (pdf){
      pdf.save(el.getElementsByClassName("report-header")[0].innerText);
    },
    autoPaging: 'text',
    x: (-(el.getBoundingClientRect().left)) + 20,
    y: (-(el.getBoundingClientRect().top)) + 20,
  });
};

//Creates report list from option from initiation
const renderReportSelect= () => {
  const select = document.getElementById(reportSelect.getId());

  //If only one report no need for chooseOption and activate geometry from start
  if (reportNames.length > 1){
    const chooseOption = document.createElement('option');
    chooseOption.value = '';
    chooseOption.text = 'Välj rapporttyp...';
    select.appendChild(chooseOption);
  }else{
    document.getElementById(geometryButtonsText.getId()).classList.remove('faded');
    document.getElementById(geometryButtonsComponent.getId()).classList.remove('faded');
    document.getElementById(requestButtonText.getId()).classList.remove('faded');
  }
 
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

    reportToolTitle = Origo.ui.Element({
      cls: 'justify-start margin-y-smaller margin-left text-weight-bold text-normal',
      innerHTML: 'Rapportverktyg',
      style: {
        width: '100%'
      }
    });
     
    closeButtonToolBox = Origo.ui.Button({
      cls: 'small round margin-top-smaller margin-bottom-auto margin-right-small icon-smallest grey-lightest margin-left-auto',
      ariaLabel: 'Stäng',
      icon: '#ic_close_24px'
    });

    reportToolBoxHeaderComponent = Origo.ui.Element({
      cls: 'flex row justify-end no-select draggable grab',
      style: { 
        cursor: 'hand',
        width: '100%'
      },
      components: [reportToolTitle, closeButtonToolBox]

    });

    reportSelect = Origo.ui.Element({
      cls: 'text-smaller',
      tagName: 'select',
      style: {
        padding: '0.2rem',
        width: '100%'
      }
    });

    geometryButtonsText = Origo.ui.Element({
      cls: 'text-smaller padding-left-smaller text-weight-bold margin-bottom-smaller faded',
      style: {
        width: '100%'
      },
      innerHTML: 'Markera geometri/yta'
    });

    polygonButton = Origo.ui.Button({
      cls: 'flex row icon-smaller text-smaller rounded-large margin-right toolbox-button',
      text: 'Polygon',
      icon: '#ic_crop_square_24px',
    }); 
    pointButton = Origo.ui.Button({
      cls: 'flex row icon-smaller text-smaller rounded-large toolbox-button',
      text: 'Rita punkt',
      icon: '#ic_place_24px'
    });
    
    geometryButtonsComponent = Origo.ui.Element({
      cls: 'flex row margin-bottom-small faded',
      components: [polygonButton,pointButton]
    });

    requestButtonText = Origo.ui.Element({
      cls: 'flex row text-smaller margin-top-smaller margin-bottom-smaller padding-left-smaller faded',
      style: {
        width: '100%'
      },
      innerHTML: 'Ingen geometri vald'
    });

    requestButton = Origo.ui.Button({
      cls: 'light rounded-large border text-smaller toolbox-button disabled',
      text: 'Skapa rapport',
      style: {
        width: '100%'
      }
    });

    requestButtonComponent = Origo.ui.Element({
      cls: 'flex row margin-bottom-small',
      components: [requestButton]
    });

    reportToolBoxContent = Origo.ui.Element({
      cls: 'margin-left-small margin-right-small',
      components: [reportSelect,geometryButtonsText, geometryButtonsComponent,requestButtonText,requestButtonComponent],
      style: {
        'user-select': 'none'
      }
    });

    reportToolBox = Origo.ui.Element({
      cls: 'absolute flex column control bg-white text-small overflow-hidden z-index-top no-select o-hidden',
      style: {
        left: '4rem',
        top: '1rem'
      },
      components: [reportToolBoxHeaderComponent, reportToolBoxContent]
    });

    closeButtonReportBox = Origo.ui.Button({
      cls: 'small round margin-top-smaller margin-bottom-auto margin-right-small icon-smaller grey-lightest margin-left-auto\" data-html2canvas-ignore=\"true\"',
      icon: '#ic_close_24px',
    });

    reportBox = Origo.ui.Element({
      tagName: 'div',
      cls: 'flex column control box bg-white o-hidden filter-box report-box',
      style: {
        left: '4rem',
        top: '1rem',
        'max-width': '30rem',
        'overflow-x': 'auto',
        'overflow-y': 'auto',
        'z-index': '-1',
        'user-select': 'none'
      }
    });

    reportButton = Origo.ui.Button({
      cls: 'o-fmereport padding-small icon-smaller round light box-shadow tooltip',
      click() {
        toggleReportButton();
      },
      icon: reportIcon,
      tooltipText: 'Ta fram en rapport',
      tooltipPlacement: 'east'
    });

    pdfExportButtonEl = Origo.ui.Button({
      cls: 'flex row light rounded-large border text-smaller icon-smaller toolbox-button\" data-html2canvas-ignore=\"true\"',
      text: 'Skapa pdf',
      icon: '#ic_download_24px',
      style: {
        display: 'block',
        margin: 'auto',
        width: '20%'
      }
    });    
   
  },

  onAdd(evt) {
    viewer = evt.target;
    if (!target) target = `${viewer.getMain().getMapTools().getId()}`;
    map = viewer.getMap();
    map.addLayer(vector);
    this.addComponents([reportButton]);
    this.render();
    renderReportSelect();
  },

  render() {
    document.getElementById(target).appendChild(dom.html(reportButton.render()));
    document.getElementById(viewer.getMain().getId()).appendChild(dom.html(reportToolBox.render()));
    document.getElementById(viewer.getMain().getId()).appendChild(dom.html(reportBox.render()));
    document.getElementById(requestButton.getId()).addEventListener('click', () => fetchContent());
    document.getElementById(closeButtonToolBox.getId()).addEventListener('click', () => disableReportButton());
    document.getElementById(polygonButton.getId()).addEventListener('click', () => mapInteraction('Polygon'));
    document.getElementById(pointButton.getId()).addEventListener('click', () => mapInteraction('Point'));
    
    origo.api().getUtils().makeElementDraggable(document.getElementById(reportToolBox.getId()));

    document.getElementById(reportSelect.getId()).addEventListener('change', () => {
      if (document.getElementById(reportSelect.getId()).value !== '') {
        document.getElementById(geometryButtonsText.getId()).classList.remove('faded');
        document.getElementById(geometryButtonsComponent.getId()).classList.remove('faded');
        document.getElementById(requestButtonText.getId()).classList.remove('faded');
      } else {
        document.getElementById(geometryButtonsText.getId()).classList.add('faded');
        document.getElementById(geometryButtonsComponent.getId()).classList.add('faded');
        document.getElementById(requestButtonText.getId()).classList.add('faded');
      }
    });
    
    this.dispatch('render');
  }
});
};

export default Fmereport;